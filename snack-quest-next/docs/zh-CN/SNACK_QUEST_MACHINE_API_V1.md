# Snack Quest 机器 API — 第 1 版

**面向自动售货机制造商的对接规范**

| | |
|---|---|
| API 版本 | `1`（每个响应都带有 `SQ-API-Version: 1`） |
| 基础 URL | **生产环境：** `https://www.snackquests.shop`。**沙箱环境：** 独立部署；其基础 URL 会随沙箱密钥一同提供给您（第 2.1 节） |
| 传输方式 | 仅限 HTTPS，JSON 请求体（`Content-Type: application/json`，UTF-8） |
| 身份验证 | HMAC-SHA256 签名请求（第 3 节） |
| 机器可读规范 | [`docs/openapi/machine-api-v1.yaml`](../openapi/machine-api-v1.yaml)（OpenAPI 3.0） |
| 参考客户端 | [`sdk/typescript/snackQuestMachine.ts`](../../sdk/typescript/snackQuestMachine.ts)、[`sdk/python/snack_quest_machine.py`](../../sdk/python/snack_quest_machine.py)——无外部依赖，可直接复制使用 |
| 签名测试向量 | [`docs/machine-api/signing-test-vectors.json`](../machine-api/signing-test-vectors.json) |
| 对接指南 | [`docs/MANUFACTURER_INTEGRATION_GUIDE.md`](MANUFACTURER_INTEGRATION_GUIDE.md)——逐步说明，附 Node、Python 和 C 示例 |
| 认证 | [`docs/MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md)——验证哪些内容以及如何验证 |
| 状态 | 稳定。变更遵循第 10 节的版本管理策略 |

本文档即为对接契约。只要您的实现遵循本文档，您的机器就可以通过 Snack Quest 销售商品。除本文档要求的信息外，我们不需要您提供任何其他信息。

---

## 目录

1. Snack Quest 如何与您的机器协同工作
2. 标识符与环境
3. 身份验证与请求签名
4. 请求与响应约定
5. 机器接口
6. 指令与出货生命周期
7. 时间戳与时钟
8. Webhook（制造商云端 → Snack Quest）
9. 事件词汇表
10. 版本管理与变更策略
11. 错误码参考
12. 接入与认证
13. 完整示例：一笔销售的全过程
14. 实施检查清单

---

## 1. Snack Quest 如何与您的机器协同工作

Snack Quest 是一个无现金自动售货平台。顾客在手机上（通过 M-Pesa 移动支付）向 Snack Quest 付款。**对于 Snack Quest 的销售，您的机器从不处理付款。** 付款确认后，Snack Quest 指示您的机器从某一个货道出货一件商品。随后，您的机器准确上报实际发生的情况。

对接方式有两种。两种方式地位相同，制造商可以使用其中一种，也可以同时使用。

| | **模式 B：您调用 Snack Quest**（本文档） | **模式 A：Snack Quest 调用您** |
|---|---|---|
| 由谁发起 | 您的机器或云端 | Snack Quest 的服务器 |
| 出货指令如何到达机器 | 您的机器轮询 `GET …/commands` | 我们调用您的 API |
| 结果如何到达我们 | `POST …/commands/{id}/status` | 您的 API 响应，或您的 Webhook（第 8 节） |
| 您需要开发什么 | 本 API 的客户端 | 一个由我们为其开发适配器的 API |
| 防火墙 | 仅需出站 HTTPS | 您需要对外开放一个接口 |

模式 B 不需要机器具备任何入站连接。如果您是从零开始，我们推荐使用模式 B。

**本文档中哪些部分适用于您：**

- **模式 B**（您的机器或云端调用 Snack Quest）：除第 8 节外的全部内容。您的机器需要实现第 3–7 节，并响应第 6 节的指令。
- **模式 A**（Snack Quest 调用您的 API）：第 3 节（您需要为 Webhook 推送签名）、第 8 节（Webhook）、第 9 节（事件词汇表）、第 10–12 节。Snack Quest 在您这一侧调用的 API 在对接指南中说明（该指南第 6 节）。您**无需**轮询第 6.1 节，也无需在此确认指令——Snack Quest 会直接把每一次出货发送到您的 API。

对于模式 A，Snack Quest 会为您的 API 编写一个**适配器**。您的事件仍然统一使用同一套词汇表（第 9 节），您的出货仍然遵循同一个生命周期（第 6.4 节），您推送给我们的任何内容仍然使用同一套签名方案（第 3 节）。

### 不可违背的规则

1. **一笔已支付的订单最多出货一次。** 每一次出货都有唯一的 `commandId`。请把它当作幂等键。已经执行过的指令，无论之后收到什么，都绝不能再次执行。
2. **上报实际发生的情况，而不是您期望的情况。** 如果您无法判断商品是否掉出，请上报 `unknown`。不要猜测为 `dispensed`。该情况会由人工处理，顾客绝不会为没有拿到的商品付费。
3. **付款成功不等于出货成功。** 已支付订单如果出货失败，将予以退款。这正是结果上报（第 6.3 节）至关重要的原因。
4. **机器身份由 Snack Quest 管理。** 您只能连接 Snack Quest 工作人员已在您的制造商名下登记的机器。API 从不创建机器。

---

## 2. 标识符与环境

| 标识符 | 所有方 | 示例 | 说明 |
|---|---|---|---|
| **机器编码** | Snack Quest | `SQ-MCH-000001` | 机器在每个 URL 中的地址。由 `connect` 返回（第 5.1 节）。 |
| **制造商机器 ID** | 您 | `NV-0001` | 您为该设备分配的 ID。您在 `connect` 时发送，工作人员登记机器时也会录入。在您的制造商范围内唯一。 |
| **货道 ID** | 您 | `motor-07` | 您为货道起的名称。Snack Quest 会将其映射到内部货道，因此您无需了解我们的货道编码。1–64 个字符，取值范围为 `[A-Za-z0-9_.:-]`。 |
| **指令 ID** | Snack Quest | `DSP-3F9A1C22`（出货）、`CMD-7B20E4D1`（维护） | 每条指令唯一。执行指令时的幂等键。 |
| **事件 ID** | 您 | `hb-NV0001-000418` | 每台机器每次发生时唯一。您上报的任何内容的幂等键（第 4.3 节）。1–128 个字符，取值范围为 `[A-Za-z0-9_.:-]`。 |

### 2.1 环境

每一个凭证和每一个机器对接都只属于一个环境：

- **`sandbox`**（沙箱）：用于开发和认证。密钥以 `sqk_test_` 开头。沙箱机器从不向真实顾客销售。
- **`production`**（生产）：正式运营的机器。密钥以 `sqk_live_` 开头。仅在通过认证（第 12 节）后签发。

**沙箱和生产是两套独立的部署，拥有各自的基础 URL 和各自的数据。** 沙箱密钥和沙箱机器只存在于沙箱部署中；您的生产密钥和机器只存在于生产部署中（`https://www.snackquests.shop`）。使用沙箱密钥进行的任何操作，都不可能触及生产机器、真实顾客或真实资金。请让固件的基础 URL、密钥和机器登记一次只指向一个环境：生产部署从不激活沙箱机器、从不向其出货、也从不为其认证，因此在生产 URL 上进行沙箱测试不会收到任何出货指令。

在同一部署中，密钥的环境还必须与机器的环境一致：在生产机器上使用沙箱密钥（或反之），会在读写任何数据之前被拒绝，返回 `403 environment_mismatch`。完全不属于您的机器返回 `404 machine_not_found`。

---

## 3. 身份验证与请求签名

每个请求都使用**对接凭证**签名。Snack Quest 以一对的形式签发给您：

- **密钥 ID（Key ID）**：`sqk_test_…` 或 `sqk_live_…`。非机密，每个请求都会携带。
- **Secret**：`sqs_…`。**只在签发时显示一次。** 请像保管密码一样保管它。绝不要把它放入手机应用、网页、日志或 URL。Snack Quest 加密保存它，无法再次显示。如果遗失，请进行轮换（第 3.5 节）。

凭证有两种：

| 类型 | 用途 |
|---|---|
| `api` | 所有 `/api/v1/machines/…` 接口 |
| `webhook` | 仅限 `/api/v1/webhooks/manufacturers/{slug}`（第 8 节） |

一种类型的密钥用于另一种类型的接口时会被拒绝（`401 wrong_key_kind`）。两种密钥可以分别吊销。

一个 `api` 密钥代表您的制造商在其所属环境中的**全部机器**；如果您提出申请，也可以只代表**某一台机器**。当每台设备直接与 Snack Quest 通信时，按机器划分的密钥是正确的选择：从一台机器中提取出的密钥无法访问任何其他机器。（第 3.6 节）

### 3.1 请求头

| 请求头 | 值 |
|---|---|
| `X-SQ-Key-Id` | 您的密钥 ID |
| `X-SQ-Timestamp` | 当前 Unix 时间，单位为**秒**，例如 `1790500000` |
| `X-SQ-Nonce` | **每个**请求都使用一个新的随机字符串，16–64 个字符，取值范围为 `[A-Za-z0-9_-]`。最理想的做法是 16 个随机字节经 base64url 编码。 |
| `X-SQ-Signature` | `v1=`，后接下文所述的小写十六进制 HMAC-SHA256 |

### 3.2 签名内容

用单个 `\n`（LF，0x0A）连接以下六个部分，构成待签名字符串，末尾不加换行：

```
v1
{X-SQ-Timestamp}
{X-SQ-Nonce}
{HTTP method, uppercase}
{path, including query string if any, exactly as sent}
{lowercase hex SHA-256 of the raw request body bytes}
```

- 路径以 `/api/v1/…` 开头，不包含主机名。如果发送了 `?query`，请将其包含在内。路径**末尾不加斜杠**：对 `…/heartbeat/` 的请求会被重定向，而重定向后的请求将不再与其签名匹配。
- 请对实际发送的**确切字节**计算哈希。如果在签名之后再对 JSON 进行格式化或重新序列化，签名将会失败。
- 没有请求体的请求（所有 `GET` 以及 `POST …/ack`）对空字符串计算哈希：
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。

然后：

```
signature = hex( HMAC-SHA256( key = secret (UTF-8), message = canonical string (UTF-8) ) )
X-SQ-Signature: v1={signature}
```

### 3.3 测试向量

在调用 API 之前，请先用这个测试向量检验您的实现。其中的 Secret 仅为示例，并非真实凭证。

```
secret     = sqs_example_secret_do_not_use_0000000000000000
method     = POST
path       = /api/v1/machines/SQ-MCH-000001/heartbeat
timestamp  = 1790500000
nonce      = Q2xhdWRlU2lnbmluZ05vbmNl
body       = {"eventId":"hb-20260927-0001","uptimeSeconds":86400}

sha256(body) = 084a5ffcb9cc2c468810ed359b15ded2b4f8c6a6c7d77ebbc2918cf2b33f55a3

canonical  = "v1\n1790500000\nQ2xhdWRlU2lnbmluZ05vbmNl\nPOST\n/api/v1/machines/SQ-MCH-000001/heartbeat\n084a5ffcb9cc2c468810ed359b15ded2b4f8c6a6c7d77ebbc2918cf2b33f55a3"

X-SQ-Signature: v1=ad94a5230dfeb4e4aeef9e6bf265f35cdb9397b0f2b9bcf91aa8eb92cafed4ca
```

Snack Quest 自己的测试套件会验证这个测试向量，因此本文档与服务器不会出现不一致。

### 3.4 参考实现

请不要从零编写签名代码。复制以下任一参考客户端即可——每个都是单个文件，除各自语言的标准库外没有任何依赖：

| 语言 | 文件 | 验证情况 |
|---|---|---|
| TypeScript / Node 18+ | `sdk/typescript/snackQuestMachine.ts` | 全部签名测试向量；对真实服务器的完整销售流程 |
| Python 3.8+ | `sdk/python/snack_quest_machine.py`（+ `example_machine.py`） | 全部签名测试向量；一次通过真实 HTTP 的完整销售 |

两个参考客户端都会：为每个请求签名；对临时性故障使用**相同的请求体字节**（因此是相同的 `eventId`）和新的 nonce 进行重试；根据服务器返回的 `stale_timestamp` 校正时钟；并包含正确的轮询周期（`runPollCycle` / `run_poll_cycle`）：先确认再出货，确认被拒绝后绝不出货，并把结果上报保存在待发队列（outbox）中，直到被接受为止。

**C 语言（嵌入式控制器）。** 任何 HMAC-SHA256 实现都可以使用，例如 mbedTLS 的 `mbedtls_md_hmac` 或 wolfSSL 的 `wc_HmacSetKey`。在缓冲区中构造待签名字符串并签名即可。在做任何其他事情之前，请先用 `signing-test-vectors.json` 中的每一个测试向量进行测试——它们覆盖了空请求体、查询字符串、非 ASCII 字节以及大写十六进制等情况。

### 3.5 防重放、时钟、轮换与吊销

- **时间戳窗口。** `X-SQ-Timestamp` 与 Snack Quest 时钟相差超过 **300 秒**的请求会被拒绝（`401 stale_timestamp`）。错误中的 `details.serverTimestamp` 是 Snack Quest 的当前时间：请据此计算时钟偏差，应用到之后的每个请求，然后重试。参考客户端会自动完成这一步。不过仍请保持时钟与 NTP 同步（第 7 节）。
- **nonce 只能使用一次。** 同一个密钥下，每个 nonce 只被接受一次。把同一个已签名请求发送两次会得到 `401 replayed_request`。**重试**时，请使用新的 nonce 和时间戳重新签名。幂等性（第 4.3 节）由请求体中的 `eventId` 保证，而不是 nonce，因此重新签名后的重试仍然是安全的。
- **轮换期间您的机器不会掉线。** Snack Quest 轮换密钥时会立即签发新密钥，旧密钥在**宽限期内继续有效**（默认 7 天，最长 30 天）。对于使用旧密钥签名的请求，每个响应都会带有 `SQ-Credential-Status: rotating` 和 `SQ-Credential-Grace-Ends:
  <ISO time>`——请对这些响应头设置告警，并在宽限期结束前部署新密钥（之后会返回 `401 key_expired`）。新的 Secret 只在轮换时显示一次。
- **吊销**会在 **30 秒**内在 Snack Quest 的所有服务器上生效（`401 key_revoked`）。如果 Secret 可能已经泄露，请立即吊销。
- **签名失败会被计数。** 来自同一地址的身份验证失败每分钟超过 120 次时，该地址会收到 `429
  too_many_auth_failures`。请先用测试向量修正签名，再进行重试。
- Snack Quest 从不记录 Secret 或签名，签发之后也从不再次显示 Secret。

### 3.6 一台设备，一个密钥

本规范的早期草案允许使用按机器签发的 Bearer 凭证（`Authorization: Bearer …`）。**该方案已被废止**：任何看到 Bearer 令牌的人都可以重放它。只携带 Bearer 令牌的请求会被拒绝，返回 `401 missing_signature`。

如果每台机器都直接与 Snack Quest 通信，而您不希望在每台设备上存放整个制造商通用的 Secret，请申请**按机器划分的密钥**：这是一个普通的签名 `api` 密钥，只能访问为其签发的那一台机器（包括 `connect`——它只能为这一台设备发起连接）。它使用与上文完全相同的签名方案，并且可以按设备分别轮换和吊销。

---

## 4. 请求与响应约定

### 4.1 响应结构

成功：

```json
{ "data": { … }, "meta": { "apiVersion": "1", "requestId": "5f0c2a9e-…" } }
```

错误：

```json
{
  "error": { "code": "validation_failed", "message": "Request body does not match the schema", "details": [ { "path": "slots.0.quantity", "message": "Too small: expected number to be >=0" } ] },
  "meta": { "apiVersion": "1" }
}
```

- `error.code` 是稳定的，请根据它进行分支处理。`error.message` 面向人工阅读，可能会变化。
- `details` 出现在 `validation_failed` 中，会列出**所有**问题，而不只是第一个。
- 响应带有 `Cache-Control: no-store`、`SQ-API-Version: 1` 和 `SQ-Request-Id`（也在 `meta.requestId` 中）。**请把请求 ID 记录**在您自己的记录中；Snack Quest 技术支持需要用它查找请求。您可以用 `X-SQ-Client-Request-Id` 为某次尝试发送您自己的 ID；它会以 `SQ-Client-Request-Id` 原样返回。
- 请求体按原始字节读取，必须是 UTF-8 编码的 JSON。`Content-Type` 请求头不做强制校验——但请发送 `application/json`。

### 4.2 状态码及处理方式

| 状态码 | 含义 | 是否重试？ |
|---|---|---|
| `200` / `202` | 已完成 / 已接受 | 否 |
| `400 invalid_json` | 请求体不是 UTF-8 编码的 JSON | 否：请修正客户端 |
| `401` | 身份验证失败（第 11 节） | 仅在修正原因之后。`stale_timestamp`：根据 `details.serverTimestamp` 校正偏差，重新签名后重试 |
| `403` | 已通过身份验证但无权操作（`environment_mismatch`、`manufacturer_suspended`） | 否 |
| `404` | 对于*这些凭证*而言，机器、指令或制造商不存在 | 否 |
| `409` | 状态冲突（指令已过期、`eventId` 被复用） | 否：请查看错误码。对于指令：**不要执行** |
| `413 payload_too_large` | 请求体超过 256 KB | 否：请拆分 |
| `422` | 格式正确但违反了契约 | 否：请修正请求内容 |
| `429` | 触发频率限制（第 4.5 节） | **是**，等待 `Retry-After` 秒后，使用新的 nonce 重新签名，使用相同的 `eventId` |
| `5xx` / 网络错误 | Snack Quest 出错或无法访问 | **是**，按退避策略重试，重新签名，使用相同的 `eventId`。`503` 会带有 `Retry-After` |

推荐的退避间隔：1 秒、2 秒、4 秒、8 秒……最长 60 秒，并加入随机抖动。请把未发送的上报保存在机器的持久化存储中，使其在重启后仍然保留，并在网络恢复后发送。第 11 节列出了每一个 `error.code` 及其重试规则。

### 4.3 幂等性与送达保证

您**上报**的所有内容都带有一个由您指定的 ID：`eventId`，库存上报则为 `reportId`。它在每台机器、每次发生时唯一。

- **相同 ID、相同内容视为重复**：会被接受但忽略（`accepted: false`、`applied: false`、`result: "duplicate"`，或计入 `duplicates`）。请将其视为成功。因此在超时之后，您**随时可以重新发送**——不会造成重复计数、重复退款或重复销售。
- **相同 ID、不同内容会被拒绝**：结果上报会收到 `409 idempotency_key_reused`；事件会被列入 `conflictingEventIds`，不予记录。以第一次上报为准。ID 针对每次发生——绝不要把同一个 ID 用于不同的事实。

一个好的做法是使用 `{kind}-{manufacturerMachineId}-{monotonic counter}`，其中计数器在重启之后仍然保留。

Snack Quest **发送给您**的所有内容都带有 `commandId`。无论之后收到什么，每条指令最多执行一次（第 6 节）。

**准确地说，保证的内容如下。** 网络会丢失消息，因此任何分布式系统都无法做到"恰好一次"送达，本系统也不作此承诺。本系统保证的是：

| | 保证 |
|---|---|
| 您的上报 → Snack Quest | **至少一次送达**（您一直重试直到收到 2xx）**+ 幂等处理**（按 `eventId`）= 每条上报只**生效**一次。 |
| 出货指令 → 您的机器 | 每笔已支付的销售**最多一条**出货指令——在联系任何机器之前通过事务性认领来保证，不受重试、崩溃或并发服务器的影响。 |
| 出货执行 | **只有在您遵循第 6 节的前提下**才能保证最多执行一次：先确认，只在收到 `200` 后执行，同一个 `commandId` 绝不执行两次。 |
| 资金 | 只有在**能够证明**未出货时（从未发出、被拒绝、从未被领取，或上报为 `failed`）才会退款。任何*可能*已经出货的情况都会交由人工处理，绝不会自动退款或自动重试。 |
| 库存 | 每笔完成的销售只产生一次库存变动（以该笔销售为键），并通过每日的台账对账进行核查。 |

### 4.4 向前兼容

- **Snack Quest 会忽略未知的请求字段。** 您可以发送新版本定义的字段，旧版服务器不会因此报错。
- **您必须忽略未知的响应字段。** 我们会在不变更版本号的情况下新增字段（第 10 节）。
- 对于 `GET …/commands` 中未知的 `type` 值，必须**先确认，再上报 `failed`**，并附 `failureReason: "unsupported command"`，绝不能静默丢弃。

### 4.5 频率限制

限制按机器、按接口、按分钟（固定窗口）计算，因此一个繁忙的接口不会挤占另一个接口——大量心跳也不会阻塞您的出货上报。

| 接口类别 | 每台机器每分钟请求数 |
|---|---|
| `connect` | 10 |
| `describe` | 30 |
| `heartbeat` | 12 |
| `status` | 30 |
| `inventory` | 12 |
| `events` | 60 个请求 |
| `event_items` | 600 个事件（一批 100 个计为 100） |
| `command_poll` | 60 |
| `command_ack` | 120 |
| `command_status` | 120 |

此外，每分钟还有以下限制：

| 范围 | 限制 |
|---|---|
| 单个密钥，覆盖您的全部机器 | 30,000 个请求 |
| 单个制造商，覆盖其全部密钥 | 60,000 个请求 |
| 单个 Webhook 密钥 | 1,200 次推送 |
| 单个来源地址 | 120 次**失败的**身份验证（正常流量从不按地址限制） |
| 单台机器 | 60 个被拒绝（4xx）的请求，超过后该机器的请求在本分钟剩余时间内都会被拒绝 |

Snack Quest 可以为某个密钥约定更高的限额。

限额的计算方式：

- 只有签名正确且携带未使用 nonce 的请求，才会计入机器或密钥的限额。以您的名义伪造或重放的请求无法消耗您的配额；它们计入发送方地址的限额。
- 被 `429` 拒绝的请求**已经用掉了它的 nonce**。请像任何重试一样，用新的 nonce 重新签名后重试（相同的请求体和 `eventId`）。
- 限额在 Snack Quest 所有服务器之间统一计算，因此把请求分散到不同服务器或连接并不能提高限额。

每个响应都带有 `SQ-RateLimit-Limit`、`SQ-RateLimit-Remaining` 和 `SQ-RateLimit-Reset`（秒）。超出限额时：返回 `429 rate_limited` 并附 `Retry-After`。正常运行（每分钟一次心跳、每 10 秒一次轮询、每隔几分钟一次状态上报）只会用掉每项限额的一小部分。

### 4.6 追踪一笔销售

每个请求都会获得一个 `SQ-Request-Id`。Snack Quest 技术支持可以在同一条时间线上追踪一笔销售：从顾客的 M-Pesa 收据开始，经过付款、出货指令及其确认、您的结果上报、库存变动，直到任何告警。请在您自己的日志中以 `commandId`、`eventId` 和 `SQ-Request-Id` 为键进行记录，这样双方总能对上。

---

## 5. 机器接口

所有路径都相对于基础 URL。`{machineCode}` 是 Snack Quest 机器编码，例如 `SQ-MCH-000001`。

| 节 | 方法与路径 | 用途 |
|---|---|---|
| 5.1 | `POST /api/v1/machines/connect` | 通报一台设备并获取其机器编码 |
| 5.2 | `GET /api/v1/machines/{machineCode}` | 机器描述：状态、能力、货道、时间间隔 |
| 5.3 | `POST /api/v1/machines/{machineCode}/heartbeat` | 存活证明 |
| 5.4 | `POST /api/v1/machines/{machineCode}/status` | 完整的状态快照 |
| 5.5 | `POST /api/v1/machines/{machineCode}/inventory` | 每个货道的库存数量 |
| 5.6 | `POST /api/v1/machines/{machineCode}/events` | 运行事件（门、故障、温度……） |
| 6.1 | `GET /api/v1/machines/{machineCode}/commands` | 当前需要执行的指令 |
| 6.2 | `POST /api/v1/machines/{machineCode}/commands/{commandId}/ack` | "我已收到并将执行" |
| 6.3 | `POST /api/v1/machines/{machineCode}/commands/{commandId}/status` | 实际发生了什么 |
| 8 | `POST /api/v1/webhooks/manufacturers/{slug}` | Webhook 推送（模式 A） |

### 5.1 连接：`POST /api/v1/machines/connect`

在设备启动或首次联网时调用。它把您的制造商机器 ID 映射到工作人员为其登记的 Snack Quest 机器，记录固件信息，并返回机器描述（第 5.2 节）。

**请求**

```json
{
  "manufacturerMachineId": "NV-0001",
  "serialNumber": "NV40-8841",
  "firmwareVersion": "4.2.1",
  "controllerType": "NVC",
  "controllerVersion": "3.2",
  "integrationVersion": "1"
}
```

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `manufacturerMachineId` | 是 | 1–128 个字符。必须与工作人员登记的一致 |
| `serialNumber` | 否 | 与登记的序列号比对。不一致时会提示工作人员，但不会拒绝 |
| `firmwareVersion`, `controllerType`, `controllerVersion` | 否 | 每个不超过 64 个字符 |
| `integrationVersion` | 否 | 您的客户端所实现的本契约版本，例如 `"1"` |

**响应 `200`**：机器描述（第 5.2 节）。

**错误**

- `404 machine_not_provisioned`：在此密钥所属环境中，您的制造商名下没有以该 ID 登记的机器。请联系 Snack Quest 进行登记。重试无济于事。

每次启动时调用 connect 都是安全的。

### 5.2 描述：`GET /api/v1/machines/{machineCode}`

```json
{
  "data": {
    "machineCode": "SQ-MCH-000001",
    "integrationState": "active",
    "environment": "production",
    "apiVersion": "1",
    "capabilities": ["vend", "dispense_confirmation", "heartbeat", "telemetry", "faults", "temperature", "door_status", "inventory_read"],
    "slots": [
      { "slotId": "motor-01", "priceKes": 250, "enabled": true, "capacity": 10 },
      { "slotId": "motor-02", "priceKes": 300, "enabled": false, "capacity": 10 }
    ],
    "pollIntervalSeconds": 10,
    "heartbeatIntervalSeconds": 60
  },
  "meta": { "apiVersion": "1" }
}
```

- `integrationState` 取值为 `configured`、`tested`、`active`、`suspended` 或 `unregistered` 之一。**只有 `active` 状态的机器才接受订单并接收出货指令。** 处于其他任何状态的机器，都不会要求顾客付款。在任何状态下都请持续发送心跳，因为机器正是通过心跳完成测试和激活的。
- `capabilities` 是 Snack Quest 对这台机器实际会使用的能力，即您的机型通过认证的能力与对接所支持能力的交集。当前取值：`vend`、`slot_read`、`inventory_read`、`inventory_write`、`dispense_confirmation`、`heartbeat`、`telemetry`、`faults`、`temperature`、`door_status`、`remote_price_update`、`remote_enable_disable`、`remote_restart`、`audit_export`、`camera`、`payment_device`、`remote_configuration`。今后可能新增（第 10 节）。
- `slots` 使用**您的**货道 ID。`priceKes` 仅供参考，因为顾客向 Snack Quest 付款，机器从不收费。已停用的货道不会售卖。
- **请按此处给出的时间间隔进行轮询和心跳**，不要使用写死的数值。Snack Quest 可以在不更新固件的情况下调整这些值。请每隔几分钟、或在每次 `connect` 之后重新读取此描述，以获取货道和价格的变化。

### 5.3 心跳：`POST /api/v1/machines/{machineCode}/heartbeat`

```json
{ "eventId": "hb-NV0001-000418", "occurredAt": "2026-09-27T09:14:05+03:00", "uptimeSeconds": 86400 }
```

可选：`"diagnostics": { "owedReports": 0, "lastError": "…", "lastErrorAt": "…" }`——机器软件自身的健康状况（已保存但尚未被接受的结果上报数量、最近一次问题）。工作人员可以在机器页面上看到。

**响应 `202`**

```json
{ "data": { "accepted": true, "reportOutcomes": [ { "commandId": "DSP-3F9A1C22", "reason": "no_outcome_received" } ] } }
```

`reportOutcomes` 列出**您已确认**、但 Snack Quest 仍在等待结果的出货指令（`reason`：`in_progress_too_long`——确认已超过 3 分钟但尚无结果；或 `no_outcome_received`——该指令此后已超时；今后可能新增其他原因，请以相同方式回复）。您从未确认过的指令绝不会出现在列表中：Snack Quest 已经知道它没有执行。该列表通常为空。请对列出的每条指令**回复一次**，使用 `POST …/commands/{commandId}/status`；回复之后该指令就不再出现（如果您的回复因网络错误失败，下一次心跳会再次列出它——只需用相同的 `eventId` 再回复一次）：

| 您的持久化存储中关于该指令的记录 | 上报内容 |
|---|---|
| 已保存其结果 | 原样重新发送该上报（相同的 `eventId`） |
| 已执行，但结果始终无法确定（例如出货过程中断电） | `unknown`，并附原因 |
| 从未执行（其确认请求从未返回 `200`） | `failed`，并附 `failureReason: "not executed"` |
| 没有任何记录（存储丢失或被重置） | `unknown`，并附 `failureReason: "no record"`——绝不能上报 `failed`：您无法证明它没有执行 |

只有存储完好的机器才能断言"未执行"：该上报会让顾客的款项进入退款流程。

每隔 `heartbeatIntervalSeconds`（默认 60 秒）发送一次。Snack Quest 根据最近一次任何形式的联系（心跳、状态上报、任何签名请求）推断机器的**在线状态**，其中 E 为心跳间隔，宽限时间 G = max(30 秒, E/2)：

| 状态 | 条件 | 影响 |
|---|---|---|
| `ONLINE` | 最近一次联系在 E + G 以内 | 接受订单（前提是最近 90 秒内也有联系） |
| `DEGRADED` | 在 3E + G 以内 | **不接受新订单**——机器可能无法领取出货指令时，不会向顾客收费 |
| `OFFLINE` | 超过上述时间，或最近一次状态上报为 `online: false`，或工作人员已标记为维护中 | 不接受订单；通知运营人员 |
| `UNKNOWN` | 配置之后从未联系过，或者您的大部分机器同时失联（很可能是我们之间的网络故障，而不是您的机器出了问题） | 不接受订单 |

机器恢复时只记录一次（`MACHINE_ONLINE`），其离线告警会自动关闭。

### 5.4 状态：`POST /api/v1/machines/{machineCode}/status`

完整的快照。请在启动时、任何情况变化时发送，并且至少每隔几分钟发送一次。

```json
{
  "eventId": "st-NV0001-000093",
  "occurredAt": "2026-09-27T09:14:05+03:00",
  "online": true,
  "doorOpen": false,
  "temperatureCelsius": 6.5,
  "faults": ["E07"],
  "paymentDeviceOk": true
}
```

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `online` | 是 | `false` 表示"我在运行，但无法出货"，例如维护期间。只要最近一次状态上报为离线，Snack Quest 就不会发送出货指令 |
| `doorOpen` | 否 | `true`、`false` 或 `null`（没有传感器） |
| `temperatureCelsius` | 否 | −50 至 100 |
| `faults` | 否 | 最多 50 个**当前生效**的故障代码，每个 1–64 个字符，取值范围为 `[A-Za-z0-9_.:-]`。每个故障都会记录为一条 `MACHINE_ERROR` 事件，并保留您的代码。故障清除后请发送 `[]` |
| `paymentDeviceOk` | 否 | 适用于设备自带支付硬件的情况。`false` 会触发 `PAYMENT_DEVICE_ERROR` |

**响应 `202`**：`{"data": {"accepted": true, "applied": true}}`

`applied: false` 表示 Snack Quest 已经持有一个 `occurredAt` **更新**的快照——延迟到达、乱序的推送（例如离线队列集中补发）绝不会覆盖更新的状态。事件（门、故障、支付设备）只在**发生变化**时产生。

### 5.5 库存：`POST /api/v1/machines/{machineCode}/inventory`

如果机器具备能力（`inventory_read`），上报机器*实际*清点到的数量。

```json
{
  "reportId": "inv-NV0001-000031",
  "occurredAt": "2026-09-27T09:14:05+03:00",
  "slots": [
    { "slotId": "motor-01", "quantity": 6 },
    { "slotId": "motor-02", "quantity": 3 },
    { "slotId": "motor-03", "quantity": 0 }
  ]
}
```

1–500 个货道，数量为 0–10,000。每份上报中，每个 `slotId` **最多出现一次**；同一货道出现两次的上报会被拒绝，返回 `422 validation_failed`。超过货道容量的数量会被记录为传感器或映射故障，绝不会记为库存。

**响应 `200`**

```json
{
  "data": {
    "slotsReported": 3,
    "stale": false,
    "mismatches": [ { "slotId": "motor-02", "expected": 4, "reported": 3 } ],
    "unmappedSlots": []
  }
}
```

Snack Quest 根据补货和销售维护自己的库存台账。您的上报**会与台账比对，但绝不会覆盖台账**。差异会被记录为 `INVENTORY_MISMATCH`，交由运营人员核查。`unmappedSlots` 列出 Snack Quest 尚未映射的货道 ID，这表示工作人员需要完成货道映射。

请发送 `occurredAt`（清点时间）。早于已应用上报的上报——延迟送达，或从离线队列中乱序发出——会被记录但不参与比对（`stale: true`）；对于在您清点之后 Snack Quest 才改变其库存的货道（销售、补货），也不会标记差异。如果没有 `occurredAt`，则使用我们收到上报的时间。

### 5.6 事件：`POST /api/v1/machines/{machineCode}/events`

每个请求最多 100 个运行事件。

```json
{
  "events": [
    { "eventId": "door-NV0001-000210", "type": "DOOR_OPENED", "occurredAt": "2026-09-27T09:20:00+03:00" },
    { "eventId": "tmp-NV0001-000977", "type": "TEMPERATURE_ALERT", "data": { "temperatureCelsius": 14.2 } },
    { "eventId": "slt-NV0001-000045", "type": "SLOT_EMPTY", "slotId": "motor-03" },
    { "eventId": "x-NV0001-000001", "type": "COIN_MECH_JAM", "data": { "code": "CM-3" } }
  ]
}
```

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `eventId` | 是 | 第 4.3 节 |
| `type` | 是 | 最好使用第 9 节中的名称。不区分大小写 |
| `occurredAt` | 否 | 第 7 节 |
| `slotId` | 否 | 您的货道 ID |
| `data` | 否 | 由字符串、数字、布尔值或 null 组成的扁平对象。最多 25 个键；字符串超过 500 个字符会被截断；嵌套的值会被丢弃 |

**响应 `202`**

```json
{ "data": { "recorded": 3, "duplicates": 0, "conflictingEventIds": [], "unknownTypes": ["COIN_MECH_JAM"], "unmappedSlots": [] } }
```

- `conflictingEventIds`：此前已收到、但内容**不同**的 ID。这些事件不会被记录；以第一次上报为准（第 4.3 节）。

- 不在第 9 节中的 `type` **不会被拒绝**。它会作为 `UNKNOWN_EVENT` 保存，并保留您的原始名称，同时列入 `unknownTypes`，提示您进行映射。
- **此处不接受出货结果。** 类型 `DISPENSE_REQUESTED`、`DISPENSE_STARTED`、`DISPENSE_SUCCESS` 和 `DISPENSE_FAILED` 会返回 `422 dispense_events_not_accepted_here`。出货结果涉及资金流转，必须通过第 6.3 节上报。这也意味着，没有真实指令作为依据的销售无法被上报。

---

## 6. 指令与出货生命周期

### 6.1 轮询：`GET /api/v1/machines/{machineCode}/commands`

```json
{
  "data": {
    "commands": [
      {
        "commandId": "DSP-3F9A1C22",
        "type": "dispense",
        "slotId": "motor-07",
        "quantity": 1,
        "issuedAt": "2026-09-27T06:21:44.120Z",
        "expiresAt": "2026-09-27T06:23:44.120Z"
      },
      {
        "commandId": "CMD-7B20E4D1",
        "type": "restart",
        "payload": null,
        "issuedAt": "2026-09-27T06:10:02.000Z",
        "expiresAt": "2026-09-27T06:25:02.000Z"
      }
    ],
    "nextPollSeconds": 2,
    "serverTime": "2026-09-27T06:21:45.004Z"
  }
}
```

- 按响应中的 `nextPollSeconds` 再次轮询：有顾客正在该机器上付款时为 **2**，其余时间为 **10**。顾客就站在机器前等待——较短的间隔正是让商品在付款后几秒内掉出的关键。空闲轮询对双方来说成本都很低。
- 出货指令排在最前面。`slotId` 是**您的**货道 ID。
- 在您确认之前，同一条指令会在每次轮询中重复返回。这就是执行必须以 `commandId` 为键的原因。
- `serverTime` 是 Snack Quest 的时钟。请依据它（或依据经 NTP 校正的时钟）判断 `expiresAt`，绝不要依据未同步的 RTC（实时时钟）。无论您的时钟显示什么，都以确认（第 6.2 节）的结果为准：在我们这边已经过期的指令会在确认时被拒绝。
- v1 中的 `type` 取值为 `dispense` 和 `restart`。今后可能新增（第 4.4 节）。

### 6.2 确认：`POST /api/v1/machines/{machineCode}/commands/{commandId}/ack`

无请求体。请在驱动任何硬件**之前**调用。

**响应 `200`**：`{"data": {"commandId": "DSP-3F9A1C22", "status": "acknowledged"}}`

**除 `200` 之外的任何响应都表示不要执行**——尤其是 `409 command_expired` 和 `409 invalid_command_state`。确认请求出现网络错误时，您无法得知结果：请重试确认（它是幂等的）；如果在 `expiresAt` 之前仍然拿不到 `200`，就不要出货。出货指令在 `issuedAt` 之后的 **2 分钟**内有效。如果您在此之后才确认，Snack Quest 已经将其判定为超时，顾客可能已经离开或已经获得退款。请丢弃该指令，不要出货。

重复确认（例如在网络超时之后）是无害的，会再次返回 `acknowledged`。一旦您已经上报 `dispensing` 或某个结果，再次确认会返回 `409
invalid_command_state`。您的持久化记录显示该指令已经执行过，因此不要再次执行。

### 6.3 上报结果：`POST /api/v1/machines/{machineCode}/commands/{commandId}/status`

**对于出货指令**（`DSP-…`）：

```json
{ "status": "dispensing", "eventId": "dsp-NV0001-005512-start", "occurredAt": "2026-09-27T09:21:47+03:00" }
```

```json
{ "status": "dispensed", "eventId": "dsp-NV0001-005512-end", "occurredAt": "2026-09-27T09:21:52+03:00" }
```

```json
{ "status": "failed", "eventId": "dsp-NV0001-005512-end", "failureCode": "jam", "failureReason": "motor-07 stall current exceeded" }
```

```json
{ "status": "unknown", "eventId": "dsp-NV0001-005512-end", "failureReason": "drop sensor offline; motor completed rotation" }
```

| `status` | 使用时机 | Snack Quest 的处理 |
|---|---|---|
| `dispensing` | 可选：电机已启动 | 记录进度 |
| `dispensed` | 掉货检测传感器（或同等装置）**确认**商品已送出 | 完成该笔销售并扣减库存 |
| `failed` | **确定**没有送出任何商品 | 为顾客退款 |
| `unknown` | 您无法判断 | 交由人工审核。不会自动为顾客退款，也暂不记录销售 |

`failureCode`（用于 `failed`）取下表中的某个代码——也可以使用**您自己的**代码（1–64 个字符，取值范围为 `[A-Za-z0-9_.:-]`），它会被记录为 `failed`，并在原因中保留您的代码，因此在固件中新增代码绝不会影响结果上报。`unknown`、`success`、`dispensed` 和 `ok` 会被拒绝（`422`）：它们与 `failed` 相矛盾——请改为上报 `status: "unknown"`。

| 代码 | 含义 |
|---|---|
| `jam` | 商品卡住或电机堵转 |
| `no_product` | 货道为空 |
| `sensor_failure` | 传感器故障，但确定没有商品掉出 |
| `timeout` | 机构未能按时完成，且没有商品掉出 |
| `machine_offline` | 机器无法动作（例如在开始前断电） |
| `failed` | 其他任何确定的失败（默认值） |

**响应 `200`**：`{"data": {"commandId": "DSP-3F9A1C22", "applied": true, "result": "applied"}}`

**每一个 `200` 都表示"停止重发这条上报"。** `result` 说明其作用：

| `result` | 含义 |
|---|---|
| `applied` | 它改变了这笔销售（完成销售，或启动退款） |
| `duplicate` | 这个 `eventId` 已经应用过——您的重试没有任何影响 |
| `already_recorded` | 另一条上报已经记录了这个结果 |
| `conflict` | 它与一个已经执行的决定相矛盾（例如退款启动之后才收到 `dispensed`）。资金不会变动；交由人工处理 |
| `progress_recorded` / `stale_progress` | 用于 `dispensing` |

今后可能新增取值；请把任何 `200` 都视为成功。

**对于维护指令**（`CMD-…`）：上报 `completed` 或 `failed`（可附 `failureReason`）。其他取值会返回 `422 invalid_status_for_command`。

**每个出货结果都要上报，即使迟到。** 如果某条指令在我们这边已经超时，但商品确实掉出了，仍请上报 `dispensed`。Snack Quest 会进行对账，记录将保持正确。

### 6.4 出货生命周期（供参考）

Snack Quest 跟踪每一次出货经过的以下状态。标有 ◆ 的步骤由您驱动。

```
REQUESTED ──▶ AUTHORIZED ──▶ SENT ──◆ ACKNOWLEDGED ──◆ DISPENSING ──◆ DISPENSED
    │              │           │            │               │
    ▼              ▼           ├──▶ TIMEOUT ◀┴───────────────┤      (machine never finished)
 REJECTED       REJECTED       │                            ◆
 (never paid /                 └──────◆─────────────────▶ FAILED      (certain: nothing dropped)
  machine not active)                                   ◆ UNKNOWN     (uncertain → human review)

TIMEOUT and UNKNOWN can still resolve to DISPENSED or FAILED when a late report arrives.
```

- **REQUESTED** 只在顾客付款确认之后创建，且每笔已支付订单只创建一次。未支付的订单不可能到达您的机器。
- **SENT** 表示它已进入您的指令队列（第 6.1 节）。
- **SENT 但在 `expiresAt` 之前从未被领取**：可以证明未出货——该指令变为 `TIMEOUT`，并为顾客退款。迟到的确认会被拒绝（`409`）。
- **ACKNOWLEDGED / DISPENSING 之后 5 分钟没有结果**：可能已经出货——变为 `TIMEOUT`，该笔销售交由人工处理；不会自动退款或自动重试。每次心跳的响应都会向机器索取该结果（`reportOutcomes`）。
- **付款状态和出货状态是两条独立的记录。** 已支付但出货失败的订单是一笔退款，而不是一笔销售。

---

## 7. 时间戳与时钟

- `occurredAt` 为 ISO-8601 格式，并**带有时区偏移**，例如 `2026-09-27T09:14:05+03:00` 或 `…Z`。该字段可选；省略时，Snack Quest 使用收到上报的时间。**不带**时区偏移的时间（`2026-09-27T09:14:05`）含义不明，因此视同省略——绝不会被猜测为 UTC 或任何本地时间。
- Snack Quest 发送的所有时间均为 UTC（`…Z`）。
- 只有在 `occurredAt` 合理时，Snack Quest 才会使用它。它不能比当前时间晚 1 分钟以上，也不能早于 24 小时以上。否则使用接收时间，您的时间戳则保留用于诊断。因此，RTC 损坏的机器也无法扰乱事件历史。
- **请求签名的要求更严格。** `X-SQ-Timestamp` 必须在 **5 分钟**以内（第 3.5 节）。被拒绝请求中的 `details.serverTimestamp` 是 Snack Quest 的时间：请据此校正偏差后重试——参考客户端会自动完成——因此时钟漂移只会多花一个请求，而不会让机器悄无声息地失联。

---

## 8. Webhook（制造商云端 → Snack Quest）

Webhook 适用于**模式 A** 制造商，由其自己的云端推送诸如出货完成、开门或故障等事件。Snack Quest 会编写一个适配器来转换您的原生数据格式。您**无需**为我们修改事件格式。

模式 B 制造商不需要 Webhook，因为第 5.6 节和第 6.3 节已经覆盖了相同的内容。

**接口：** `POST /api/v1/webhooks/manufacturers/{slug}`，其中 `{slug}` 是接入时提供给您的制造商标识。

**身份验证：** 使用 `webhook` 类型的凭证，签名方式与第 3 节完全相同（相同的请求头、相同的待签名字符串、相同的 5 分钟窗口，以及一次性 nonce）。未签名或签名错误的推送会在读取请求体之前被拒绝。

**您的数据中需要包含哪些信息。** 适配器按照您的格式编写，但您的数据中必须包含以下信息：

| 信息 | 原因 |
|---|---|
| 唯一的**推送 ID** | 对整次推送去重 |
| 每个事件唯一的**事件 ID** | 对单个事件去重 |
| 每个事件对应的**您的机器 ID** | 将其路由到正确的 Snack Quest 机器 |
| **事件类型** | 转换为第 9 节的词汇 |
| 对于出货结果，我们在请求出货时提供给您的 **Snack Quest `commandId`** | 将结果与已支付订单关联。没有它，结果无法应用 |
| 对于出货失败，**原因代码** | 映射到第 6.3 节的失败代码 |

**响应（按您的重试逻辑设计）**

| 状态码 | 含义 | 您的发送方应当 |
|---|---|---|
| `202` | 已处理 | 停止 |
| `200`，且 `"duplicate": true` | 已经处理过 | 停止 |
| `401` | 签名、时间戳、nonce 或密钥有问题 | 修正后重新签名；不要盲目重试 |
| `403 manufacturer_suspended` | 对接已暂停 | 停止；联系 Snack Quest |
| `404 manufacturer_not_found` | 标识（slug）与您的凭证不匹配 | 停止；修正 URL |
| `422 unrecognised_payload` / `webhooks_not_supported` | 数据不符合约定格式 | 停止；修正数据 |
| `5xx` / 超时 | 未（完全）处理 | 按退避策略**重试**，重新签名。这是安全的：部分处理的推送会以幂等方式重新处理 |

`202` 的响应体会说明处理结果，包括我们无法识别的机器 ID：

```json
{
  "data": {
    "deliveryId": "whk_01J8Z6Q4M2",
    "duplicate": false,
    "eventsRecorded": 4,
    "eventsDuplicate": 0,
    "dispenseOutcomesApplied": 1,
    "unmatchedMachines": ["NV-9999"],
    "unknownEventTypes": [],
    "conflictingEventIds": []
  }
}
```

您的平台可以按需多次重新推送：此前见过的推送或事件会被确认但不会再次应用，同一个出货结果无论到达多少次都只生效一次。

---

## 9. 事件词汇表

以下是 Snack Quest 自己的事件名称。请在第 5.6 节中使用它们。模式 A 的适配器会把您的原生名称映射为这些名称。

| 类型 | 含义 | 严重程度 |
|---|---|---|
| `MACHINE_ONLINE` / `MACHINE_OFFLINE` | 联网或服务状态发生变化 | 信息 / 严重 |
| `HEARTBEAT_RECEIVED` | 存活证明（通常通过第 5.3 节发送） | 信息 |
| `STATUS_REPORTED` | 状态快照（通常通过第 5.4 节发送） | 信息 |
| `SLOT_EMPTY` / `SLOT_LOW` | 货道传感器显示已空 / 不足 | 警告 |
| `INVENTORY_REPORTED` | 已上报数量（通常通过第 5.5 节） | 信息 |
| `MACHINE_ERROR` | 硬件故障。请把您的代码放在 `data.code` 中 | 严重 |
| `TEMPERATURE_REPORTED` | 定期读数。使用 `data.temperatureCelsius` | 信息 |
| `TEMPERATURE_ALERT` | 超出安全范围 | 严重 |
| `DOOR_OPENED` / `DOOR_CLOSED` | 维护门 | 警告 / 信息 |
| `CAMERA_OFFLINE` | 机载摄像头不可用 | 警告 |
| `PAYMENT_DEVICE_ERROR` | 设备自带的支付硬件故障 | 警告 |

以下事件由 Snack Quest 自己记录：`DISPENSE_REQUESTED`、`DISPENSE_STARTED`、`DISPENSE_SUCCESS`、`DISPENSE_FAILED`、`INVENTORY_MISMATCH`、`DISPENSE_OUTCOME_CONFLICT`、`DISPENSE_UNRECOGNISED` 和 `FIRMWARE_CHANGED`。您无需发送它们：`DISPENSE_*` 结果在 `/events` 上会被拒绝（第 5.6 节），而您发送的其他 Snack Quest 专用名称会被保存为 `UNKNOWN_EVENT`。任何无法识别的类型都会变为 `UNKNOWN_EVENT` 并保留原始名称——绝不会报错。

---

## 10. 版本管理与变更策略

版本号位于路径中（`/api/v1/`），也位于 `SQ-API-Version` 响应头中。

**非破坏性变更。以下变更可能在 v1 内随时发生，您的客户端必须能够兼容：**

- 新增接口；
- 新增**可选**请求字段；
- 新增响应字段；
- 第 9 节新增事件类型、新增维护指令 `type`（第 4.4 节），以及在现有 HTTP 状态类别中新增 `error.code`；
- 调整建议性数值，例如 `pollIntervalSeconds`。

**破坏性变更。以下变更只会出现在新版本中（`/api/v2/`）：**

- 删除或重命名字段、接口或事件类型；
- 把可选字段改为必填，或收紧现有字段的校验；
- 修改签名方案（新方案将在 `X-SQ-Signature` 中使用 `v2=`，迁移期间与 `v1=` 同时被接受）；
- 改变状态码或失败代码的含义。

**各类变更的处理方式**

| 变更 | 规则 |
|---|---|
| 新的可选请求字段 | 不认识该字段的服务器会忽略它；您可以提前发送 |
| 新的响应字段 | 您必须忽略不认识的字段 |
| 已弃用的字段 | 在 v1 剩余的生命周期内仍被接受、仍会返回；在本文档和 OpenAPI 中标注为已弃用，并注明将其删除的版本 |
| 枚举值（`result`、`reason`、`integrationState`、能力、指令 `type`） | **开放**：可能出现新值。对未知值采用安全的默认处理（未知指令 → 确认，并上报 `failed` "unsupported command"；未知能力 → 忽略） |
| 您的枚举值（`failureCode`、事件 `type`） | **宽容**：我们不认识的代码或类型会被保存，绝不会被拒绝（第 5.6 节、第 6.3 节） |
| 新能力 | 在 `capabilities` 中公布（第 5.2 节）；绝不会要求现有机型具备 |
| 新事件类型 | 加入第 9 节；旧客户端永远不需要发送它 |
| 新指令类型 | 只发送给通过了相应认证的机型 |
| 新的身份验证方式 | 与 `v1=` 签名并存；`v1=` 在整个 v1 期间持续有效 |
| 任何破坏性变更 | `/api/v2/`，并与 v1 并行运行 |

**版本退役。** 破坏性变更绝不会在 v1 内发生。v2 发布后，v1 会与其并行运行；只有在以书面形式通知每一个拥有活跃对接的制造商，并提供变更日志、迁移指南和退役日期之后，v1 才会退役。通知期以您与 Snack Quest 签订的对接协议为准。本文档不规定通知期，本文档的任何内容都不应被理解为固定的支持期限。

**安全例外。** 如果 v1 中的缺陷危及顾客资金或您的机器，Snack Quest 可能会以较短的通知期改变 v1 的行为，例如拒绝某种不安全的客户端用法。我们会直接与您联系并说明变更。

---

## 11. 错误码参考

API 可能返回的每一个错误码。`code` 在 v1 内保持稳定；请根据它进行分支处理，而不是根据 `message`。OpenAPI 文档中也有相同的列表（`x-sq-error-codes`）；只要服务器、OpenAPI 文档与本表之间出现任何不一致，Snack Quest 的契约测试就会导致构建失败。

| 状态码 | 错误码 | 含义 | 是否重试？ |
|---|---|---|---|
| 400 | `invalid_json` | 请求体不是有效的 UTF-8 JSON。 | 否——请修正请求 |
| 413 | `payload_too_large` | 请求体超过大小限制。 | 否——请修正请求 |
| 401 | `missing_signature` | 缺少四个 X-SQ-* 签名请求头之一。 | 否——请修正请求 |
| 401 | `unknown_key` | 没有使用该密钥 ID 的凭证。 | 否——请修正请求 |
| 401 | `key_revoked` | 该密钥已被吊销。请获取新密钥。 | 在我们或您这边修正原因之后 |
| 401 | `key_expired` | 该密钥已过期（或其轮换宽限期已结束）。请使用新密钥。 | 在我们或您这边修正原因之后 |
| 401 | `wrong_key_kind` | API 密钥被用于 Webhook，或反之。 | 否——请修正请求 |
| 401 | `stale_timestamp` | X-SQ-Timestamp 超出 ±300 秒。details.serverTimestamp 给出服务器时间：请校正偏差后重试。 | 是——按退避策略，相同的 `eventId`，新的 nonce |
| 401 | `invalid_nonce` | X-SQ-Nonce 不是 16–64 个 [A-Za-z0-9_-] 字符。 | 否——请修正请求 |
| 401 | `invalid_signature` | 签名不匹配。请用测试向量核对待签名字符串。 | 否——请修正请求 |
| 401 | `replayed_request` | 该 nonce 已被使用过。每次尝试都需要新的 nonce。 | 不能原样重试——请使用新的 nonce 和时间戳重新签名，请求体和 `eventId` 保持不变 |
| 403 | `environment_mismatch` | 沙箱密钥访问了生产机器，或反之。 | 否——请修正请求 |
| 403 | `manufacturer_suspended` | 该制造商已被暂停。 | 在我们或您这边修正原因之后 |
| 404 | `machine_not_found` | 这些凭证无法访问使用该编码的机器。 | 否——请修正请求 |
| 404 | `machine_not_provisioned` | 在这些凭证下，没有为该 manufacturerMachineId 登记的机器。 | 在我们或您这边修正原因之后 |
| 404 | `command_not_found` | 该机器没有这条指令。 | 否。对于确认请求：**不要执行**。对于上报：停止重发，并核对机器编码和 `commandId` |
| 404 | `manufacturer_not_found` | 该 Webhook 标识（slug）不属于这些凭证。 | 否——请修正请求 |
| 409 | `command_expired` | 该指令在被确认之前已经过期。不要执行。 | 否——**不要执行**；丢弃该指令。无需上报：顾客已经获得退款 |
| 409 | `invalid_command_state` | 该指令无法再进入该状态（例如已经结束）。不要执行。 | 否。对于确认请求：**不要执行**（它已经执行过或已被处理）。对于上报：停止重发；保留该上报及其 `SQ-Request-Id` 以便联系技术支持 |
| 409 | `idempotency_key_reused` | 该 eventId 已被用于另一条不同的上报。事件 ID 针对每次发生。 | 否——以第一次上报为准。请修正您的 `eventId` 生成方式；如果因此有真实结果未能上报，请联系技术支持 |
| 422 | `validation_failed` | 请求体不符合数据结构；details 列出每一个问题。 | 否——请修正请求 |
| 422 | `dispense_events_not_accepted_here` | DISPENSE_* 结果应发送到 /commands/{commandId}/status，而不是 /events。 | 否——请修正请求 |
| 422 | `invalid_status_for_command` | 该状态不适用于此类指令。 | 否——请修正请求 |
| 422 | `unrecognised_payload` | Webhook 数据不符合约定格式。 | 否——请修正请求 |
| 422 | `webhooks_not_supported` | 该制造商的对接不接受 Webhook。 | 否——请修正请求 |
| 429 | `rate_limited` | 超出频率限制。请在 Retry-After 秒后重试；参见 SQ-RateLimit-* 响应头。 | 是——按退避策略，相同的 `eventId`，新的 nonce |
| 429 | `too_many_auth_failures` | 来自该地址的身份验证失败次数过多。请先修正签名再重试。 | 是——按退避策略，相同的 `eventId`，新的 nonce |
| 500 | `internal_error` | 意外错误。请使用相同的 eventId 重试；联系技术支持时请提供 SQ-Request-Id。 | 是——按退避策略，相同的 `eventId`，新的 nonce |
| 503 | `temporarily_unavailable` | 某项依赖服务不可用。请按退避策略重试。 | 是——按退避策略，相同的 `eventId`，新的 nonce |

---

## 12. 接入与认证

| 阶段 | 内容 | 您将获得 |
|---|---|---|
| 1. 申请 | 您提交公司信息、联系人、机型列表以及对接方式偏好（模式 A 或 B） | 本文档 |
| 2. 技术评审 | 我们评审您的协议或其与本契约的匹配程度、货道命名以及故障模式 | 您的制造商标识（slug） |
| 3. 凭证 | 我们签发**沙箱**凭证 | `sqk_test_…` 密钥对 |
| 4. 测试环境 | 您针对我们为您登记的沙箱机器进行开发和测试 | 沙箱机器编码 |
| 5. 认证 | 我们依据下方的检查清单逐项验证每个机型，并留存证据 | 已认证的机型 |
| 6. 生产 | 我们签发**生产**凭证并激活正式运营的机器 | `sqk_live_…` 密钥对 |

机型通过认证之前，无法签发生产凭证，也无法激活生产机器。认证按机型进行。如果某个机型的能力之后发生变化，必须重新认证。

**认证检查清单。** 以下是针对您的机型记录的检查项。每一项都需要证据，例如测试运行 ID、沙箱交易编号、日志或实物测试视频。[`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md) 详细说明了每一项的验证方式。

| 检查项 | 验证内容 |
|---|---|
| 身份验证 | 签名请求被接受；错误签名、过期时间戳和重放会被拒绝，且您的客户端能够正确处理；没有复用 nonce |
| 机器登记 | `connect` 将您的 ID 映射到正确的机器；序列号一致 |
| 心跳 | 按公布的间隔发送心跳 |
| 状态上报 | 准确、及时地上报门、温度和故障 |
| 库存 | 上报数量与实际数量一致（不具备 `inventory_read` 能力时为*不适用*） |
| 商品 / 货道映射 | 您的货道 ID 映射到正确的实际货道 |
| 出货指令 | 指令被领取，出货**之前**先确认，确认被拒绝后绝不执行 |
| 出货确认 | 只有商品实际掉出时才上报 `dispensed` |
| 出货失败 | 卡货或空货道时上报 `failed`，并附正确的代码 |
| 幂等性 | 重新发送的上报被识别为同一条上报；同一条指令被送达两次（领取、暂存、再次送达）时只执行并上报一次 |
| 错误处理 | 4xx 与 5xx 的处理方式符合第 4.2 节 |
| Webhook | 带签名的推送、重试、去重（不使用 Webhook 时为*不适用*） |
| 支付流程 | 一笔已支付的沙箱销售完成出货，并得到端到端确认 |
| 对账 | 过期的指令绝不会被执行；未能发送的结果上报（网络中断）会被保留并在之后送达；不确定的结果如实上报，而不是猜测 |
| 自动化契约测试套件 | 认证测试工具针对您的机型完成一次完整且通过的运行 |

所有未标记为*不适用*的检查项都是必需的。最后一项只能由测试工具本身记录，无法手动勾选。

**自动化认证测试工具。** 检查清单中的大部分项目，由 Snack Quest 在沙箱中针对您的机器运行的测试工具进行验证。它执行一套固定的脚本——连接、心跳、状态、库存、门事件、一笔真实的沙箱销售、一条重新发送的结果上报、一条被送达两次的指令、一笔结果上报被扣留（模拟网络中断）的销售、一笔从您已清空的货道发起的销售，以及一条在您的机器持有期间过期的指令——并依据 Snack Quest 记录的内容（而不是机器自己的声明）判定每一步：

```
CONNECT ✓  AUTHENTICATION ✓  HEARTBEAT ✓  STATUS ✓  INVENTORY ✓  EVENTS ✓
COMMAND POLLING ✓  ACKNOWLEDGEMENT ✓  DISPENSE ✓  FAILURE HANDLING ✓
IDEMPOTENCY ✓  REPLAY PROTECTION ✓  TIMEOUT HANDLING ✓
DUPLICATE DELIVERY ✓  OFFLINE RECOVERY ✓                      → CERTIFIED
```

任何一项检查未通过，结论即为 **NOT CERTIFIED**，并详细说明失败原因（例如 "ACKNOWLEDGEMENT: history sent → dispensing → dispensed"——机器在未确认的情况下就出了货）。测试工具通过您开发的**沙箱控制接口**驱动您的沙箱机器（[`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md)）。无法驱动您的机器完成的步骤为*未验证*，而包含任何未验证步骤的运行结论均为 NOT CERTIFIED，因此全部控制接口都是认证所必需的。通过的结果会作为证据记录到您的机型上；测试工具本身从不单独认证机型——最终由人工签字确认。Snack Quest 的模拟机器也能通过同一套测试，因此您可以把您机器的请求日志与一份已知正确的日志进行对比。

测试工具适用于模式 B（您的机器调用 Snack Quest）。模式 A 的 API 在沙箱中通过认证指南所述的 API 探测工具进行检查。模式 A 机型的生产认证还需要为您的 API 开发的生产适配器，以及通过该适配器完成的测试运行，这些由 Snack Quest 与您共同完成。

---

## 13. 完整示例：一笔销售的全过程

机器 `SQ-MCH-000001`（您的 `NV-0001`），货道 `motor-07`，商品售价 250 肯尼亚先令（KES）。

```
 Customer's phone          Snack Quest                          Your machine
       │                        │                                     │
       │  scan, choose, pay ──▶ │                                     │
       │                        │  M-Pesa confirms payment            │
       │                        │  creates DSP-3F9A1C22 (once)        │
       │                        │                                     │
       │                        │ ◀── GET …/commands ─────────────────│  (every 10 s)
       │                        │ ── [{DSP-3F9A1C22, motor-07}] ─────▶│
       │                        │                                     │  seen DSP-3F9A1C22 before? no
       │                        │ ◀── POST …/DSP-3F9A1C22/ack ────────│
       │                        │ ── 200 acknowledged ───────────────▶│  persist "DSP-3F9A1C22: executing"
       │                        │ ◀── POST …/status {dispensing} ─────│  run motor-07
       │                        │                                     │  drop sensor: product delivered
       │                        │ ◀── POST …/status {dispensed} ──────│  persist "DSP-3F9A1C22: done"
       │  "Enjoy your snack" ◀─ │ ── 200 applied ────────────────────▶│
```

**机器端循环（伪代码）**

```
every nextPollSeconds (from the last poll; 10 if unknown):
  for cmd in GET /commands:
    if store.has(cmd.commandId): continue                 # executed before: never twice
    if cmd.type not in SUPPORTED:
      ack(cmd); report(cmd, failed, reason="unsupported command"); continue
    r = ack(cmd)
    if r.status != 200: store.put(cmd.commandId, "refused"); continue   # not acknowledged: do not dispense
    store.put(cmd.commandId, "executing")                 # persist BEFORE actuating
    report(cmd, dispensing)
    outcome = hardware.vend(cmd.slotId)                   # dispensed | failed(code) | unknown
    store.put(cmd.commandId, outcome)
    report(cmd, outcome)                                  # queued + retried until 2xx; same eventId every retry

on boot:
  for id, state in store where state == "executing":      # power lost mid-vend
    report(id, unknown, reason="power lost during dispense")
```

持久化的 `store` 是实现防重复和离线恢复的关键。出货过程中断电的机器，在重启后绝不能重新执行该指令，而应上报 `unknown`。

---

## 14. 实施检查清单

- [ ] 签名能够复现 `docs/machine-api/signing-test-vectors.json` 中的每一个测试向量（或使用参考客户端，第 3.4 节）
- [ ] 每个请求（包括重试）都使用新的 nonce 和时间戳
- [ ] Secret 安全保存；从不写入日志，也从不随客户端应用分发
- [ ] 时钟与 NTP 同步（最差不超过 ±5 分钟）
- [ ] 启动时调用 `connect`；定期重新读取机器描述
- [ ] 按第 5.2 节给出的间隔进行心跳和轮询
- [ ] 每条上报都有唯一且持久化的 `eventId`；重试时使用相同的 ID
- [ ] 未发送的上报在重启后仍然保留，并在重新联网后发送
- [ ] 在驱动硬件之前持久化 `commandId`；指令绝不会执行两次
- [ ] 确认请求的响应只要不是 `200`，就表示**不要出货**
- [ ] 根据 `details.serverTimestamp` 校正时钟偏差，以处理 `stale_timestamp`
- [ ] 通过等待 `Retry-After` 来处理 `429`；`SQ-Credential-Status: rotating` 提醒您部署新密钥
- [ ] 每条上报都记录 `SQ-Request-Id`
- [ ] 根据已保存的结果回复心跳响应中的 `reportOutcomes`
- [ ] 只有实际确认出货后才上报 `dispensed`；不确定时上报 `unknown`
- [ ] 迟到的结果仍然上报
- [ ] 5xx 和网络错误按退避策略重试；4xx 不盲目重试
- [ ] 按第 4.4 节处理未知的响应字段和指令类型

---

*如对本规范有任何疑问，请联系您的 Snack Quest 对接工程师。*
