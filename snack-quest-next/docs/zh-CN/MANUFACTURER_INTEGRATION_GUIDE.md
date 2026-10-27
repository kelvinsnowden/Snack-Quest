# Snack Quest 制造商对接指南

**逐步完成贵司机器与 Snack Quest 的对接**

本指南按工作顺序带您完成对接。具体规则以规范为准；若本指南与规范有出入，以规范为准：

| 文档 | 用途 |
|---|---|
| [`SNACK_QUEST_MACHINE_API_V1.md`](SNACK_QUEST_MACHINE_API_V1.md) | 对接契约：签名、接口、出货生命周期、保证与错误码 |
| [`openapi/machine-api-v1.yaml`](../openapi/machine-api-v1.yaml) | 同一套 API 的机器可读版本（可导入 Postman、代码生成工具） |
| [`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md) | 机型在开始销售前如何通过认证 |
| [`machine-api/signing-test-vectors.json`](../machine-api/signing-test-vectors.json) | 官方签名测试向量 |
| `sdk/typescript`, `sdk/python`, `sdk/c` | 可直接复制使用的参考代码 |

---

## 1. 现有能力与需要您开发的部分

请先阅读本节。本节直接说明 Snack Quest 已经在运行的部分、需要针对您的硬件开发的部分，以及暂未提供的部分。

### Snack Quest 已实现并经过测试的部分

- **机器 API v1**：规范中的十个操作（connect 连接、describe 描述、heartbeat 心跳、status 状态、inventory 库存、events 事件、指令轮询、确认、结果上报、Webhook 推送）。
- **请求签名**：HMAC-SHA256 签名，nonce 一次性使用，时间戳窗口为 ±300 秒。密钥可以轮换（旧密钥在宽限期内继续有效），也可以吊销（30 秒内生效）。您可以申请按机器划分的密钥。
- **环境**：沙箱环境与生产环境相互独立。沙箱密钥无法访问生产机器；机型通过认证之前，生产机器无法激活。
- **出货生命周期**：每笔已支付的销售只产生一条出货指令。指令必须在 2 分钟内领取，并且只有在确认之后才会执行。结果上报按 `eventId` 去重。心跳的响应会告诉您 Snack Quest 仍在等待哪些出货结果。
- **退款规则**：只有在能够证明未出货时才会退款。任何不确定的情况都会交由人工处理。
- **频率限制**：按机器、按接口限制，并在 Snack Quest 的所有服务器之间统一计算。
- **Webhook**：为模式 A 制造商提供的带签名、可去重的接收接口。
- **参考代码**：
  - TypeScript 客户端和 Python 客户端，均已通过对真实服务器的完整销售流程验证；
  - C 语言签名函数，已通过全部签名测试向量验证。
- **认证工具**：用于模式 B 机器的自动化认证测试工具（harness），以及用于模式 A API 的 API 探测工具，二者均在认证指南中说明。

### 需要您开发的部分（因厂商而异）

| 您的对接方式 | 您需要开发 | Snack Quest 负责开发 |
|---|---|---|
| **模式 B**：您的机器或云端调用 Snack Quest（推荐） | 一个 API 客户端：签名、上报、轮询 → 确认 → 出货 → 上报 的循环，以及对已执行指令和未发送上报的持久化存储。另外还需开发认证测试工具所驱动的**沙箱控制接口**。 | 无需任何与硬件相关的开发。工作人员登记您的机器并映射您的货道 ID。 |
| **模式 A**：Snack Quest 调用您的云端 | 一个 HTTPS API（第 6 节说明其必须提供的功能），以及用于上报结果和事件的带签名 Webhook | 针对您的 API 编写并在您的沙箱中测试的**适配器**。Snack Quest 的参考适配器是仅限沙箱使用的模板，因此生产适配器需要专门针对您的 API 编写。 |

### 暂未提供的功能

- **指令推送**（MQTT、WebSocket）。机器通过轮询获取指令；每次轮询的响应会告诉机器下次何时轮询（有顾客正在该机器上付款时每 2 秒一次，其余时间每 10 秒一次）。
- **模式 A 的生产环境。** 目前可以在沙箱中使用参考适配器和 API 探测工具开发并测试模式 A 对接。要进入生产环境，还需要 Snack Quest 为您的 API 开发两样东西，而这两样目前尚未为任何制造商开发：
  - 生产适配器；
  - 通过该适配器运行的认证测试。

  参见 [`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md#4-model-a-the-api-probe)。
- **自助管理密钥。** 密钥由 Snack Quest 工作人员根据您的申请签发、轮换和吊销。
- **从机器读取货道与价格。** 价格保存在 Snack Quest。您的机器通过 `describe`（规范第 5.2 节）获取价格，机器本身从不设置价格。

有一种情况需要您在设计时考虑：顾客付款期间，Snack Quest 不会预留库存。如果两位顾客同时为某个货道的最后一件商品付款，第二条出货指令到达时该货道已空。此时请上报 `failed`，并附 `failureCode: "no_product"`，系统会为顾客退款。除非商品确实已经掉出，否则绝不能上报 `dispensed`。

---

## 2. 选择对接模式

如果您的机器或您自己的云端可以发起出站 HTTPS 请求，请选择**模式 B**。它不需要任何入站连接，客户端完全由您掌控，并且是自动化认证所覆盖的模式。

如果您的机器已经通过您自己的云端 API 控制，并且您更希望由 Snack Quest 调用该 API，请选择**模式 A**。在此模式下，需要一个双方联合开发的阶段，由 Snack Quest 针对您的沙箱编写并测试适配器。

两种模式也可以混合使用，例如出货采用模式 A，部分事件通过 Webhook 推送。具体方案请与您的对接工程师商定。

---

## 3. 获取沙箱访问权限

您将从 Snack Quest 获得：

1. **沙箱基础 URL**——与生产环境（`https://www.snackquests.shop`）分开部署，拥有独立的数据；
2. 您的**制造商标识（slug）**（用于 Webhook URL）；
3. 一个**沙箱 API 密钥**：密钥 ID `sqk_test_…` 和 Secret `sqs_…`。Secret 只显示一次，请像保管密码一样保管；
4. 一台或多台按您自己的机器 ID（`manufacturerMachineId`）登记的**沙箱机器**，并已映射好您的货道 ID；
5. 如采用模式 A，还将获得一个**沙箱 Webhook 密钥**，Snack Quest 也会向您索取您的沙箱 API 基础 URL 以及访问该 API 的密钥。

沙箱和生产是**两套独立的部署**。请针对沙箱基础 URL 进行开发和认证；生产环境（`https://www.snackquests.shop`）从不向沙箱机器出货，也不为沙箱机器做认证，沙箱密钥在生产环境中并不存在。请把基础 URL 和密钥放在同一份配置中一起管理，避免某台设备拿到一个环境的 URL 和另一个环境的密钥。

切勿把 Secret 放入手机应用、网页、日志、URL 或源代码仓库。按机器划分的密钥（规范第 3.6 节）可以把单台设备被攻破时的损失降到最低。

---

## 4. 请求签名

每个请求都带有四个请求头。签名是对以下六行内容计算的 HMAC-SHA256（规范第 3.2 节）：

```
v1
{timestamp}
{nonce}
{METHOD}
{path with query, exactly as sent}
{hex SHA-256 of the exact body bytes}
```

在发送任何请求之前，请用 `signing-test-vectors.json` 中的**每一个**测试向量检验您的实现。下面的每个示例都已用规范第 3.3 节中的心跳测试向量运行过，并能完全复现其结果。

### Node.js（18 及以上版本，无需依赖）

```js
import { createHash, createHmac, randomBytes } from 'node:crypto';

export function signedHeaders({ keyId, secret, method, pathWithQuery, body = '', timestamp = Math.floor(Date.now() / 1000), nonce = randomBytes(16).toString('base64url') }) {
  const bodyHash = createHash('sha256').update(body).digest('hex'); // hash the exact bytes you send
  const canonical = ['v1', timestamp, nonce, method.toUpperCase(), pathWithQuery, bodyHash].join('\n');
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');
  return {
    'X-SQ-Key-Id': keyId,
    'X-SQ-Timestamp': String(timestamp),
    'X-SQ-Nonce': nonce,
    'X-SQ-Signature': `v1=${signature}`,
    'Content-Type': 'application/json',
  };
}

// Serialise once, sign those bytes, send those bytes.
const body = JSON.stringify({ eventId: 'hb-NV0001-000418', uptimeSeconds: 86400 });
const path = '/api/v1/machines/SQ-MCH-000001/heartbeat';
const response = await fetch(`https://www.snackquests.shop${path}`, {
  method: 'POST',
  headers: signedHeaders({ keyId: process.env.SQ_KEY_ID, secret: process.env.SQ_SECRET, method: 'POST', pathWithQuery: path, body }),
  body,
});
```

### Python（3.8 及以上版本，仅使用标准库）

```python
import base64, hashlib, hmac, secrets, time

def signed_headers(key_id, secret, method, path_with_query, body=b"", timestamp=None, nonce=None):
    timestamp = int(time.time()) if timestamp is None else timestamp
    nonce = nonce or base64.urlsafe_b64encode(secrets.token_bytes(16)).rstrip(b"=").decode()
    body_hash = hashlib.sha256(body).hexdigest()  # hash the exact bytes you send
    canonical = "\n".join(["v1", str(timestamp), nonce, method.upper(), path_with_query, body_hash])
    signature = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return {
        "X-SQ-Key-Id": key_id,
        "X-SQ-Timestamp": str(timestamp),
        "X-SQ-Nonce": nonce,
        "X-SQ-Signature": "v1=" + signature,
        "Content-Type": "application/json",
    }
```

### C 语言（嵌入式控制器）

`sdk/c/sq_sign.c` 和 `sq_sign.h` 用 C99 实现了签名，使用 OpenSSL 计算 SHA-256 和 HMAC。如果您使用 mbedTLS 或 wolfSSL，只需替换标注为 *crypto backend* 的两个函数，其余代码保持不变。`sdk/c/vector_check.c` 运行单个测试向量；Snack Quest 的测试套件会编译它并检查全部测试向量。

```c
#include "sq_sign.h"

const char *body = "{\"eventId\":\"hb-NV0001-000418\",\"uptimeSeconds\":86400}";
char timestamp[16], nonce[23], header[SQ_SIGNATURE_HEADER_LEN + 1];
snprintf(timestamp, sizeof timestamp, "%ld", (long)(time(NULL) + clock_offset));
make_nonce(nonce, sizeof nonce);   /* yours: 16 random bytes, base64url, from a hardware RNG */

if (sq_sign(secret, "POST", "/api/v1/machines/SQ-MCH-000001/heartbeat", timestamp, nonce,
            (const unsigned char *)body, strlen(body), header, sizeof header) != 0) {
  /* do not send an unsigned request */
}
/* send headers X-SQ-Key-Id, X-SQ-Timestamp: timestamp, X-SQ-Nonce: nonce, X-SQ-Signature: header */
```

在控制器上：

- nonce 必须来自硬件随机数发生器，绝不能使用 `rand()`。
- 请保持时钟与 NTP 同步。如果收到 `401 stale_timestamp`，请根据 `error.details.serverTimestamp` 设置 `clock_offset`，然后重新签名。

### 最常见的签名错误

| 现象 | 原因 |
|---|---|
| POST 请求返回 `invalid_signature`，GET 请求正常 | 您计算哈希时使用的请求体序列化结果与实际发送的不一致（格式化缩进、键顺序、重新编码） |
| 只有带查询字符串时才返回 `invalid_signature` | 签名的路径中漏掉了查询字符串，或参数顺序被调整 |
| 重试时返回 `replayed_request` | 重试时复用了同一个 nonce。每次尝试都需要新的 nonce 和新的签名（并使用相同的 `eventId`） |
| `stale_timestamp` | 您的时钟偏差超过 300 秒。请根据 `details.serverTimestamp` 校正 |
| `environment_mismatch` | 在生产机器上使用了沙箱密钥，或反之 |

---

## 5. 模式 B 分步说明

参考客户端已经实现了以下全部内容。请复制 `sdk/typescript/snackQuestMachine.ts`（Node 18 及以上）或 `sdk/python/snack_quest_machine.py`（Python 3.8 及以上），并阅读其文件头注释。`sdk/python/example_machine.py` 是一个完整的最小化机器示例。

### 5.1 启动：连接并读取机器描述

```ts
import { SnackQuestMachineClient, newEventId } from './snackQuestMachine';

const sq = new SnackQuestMachineClient({ baseUrl: 'https://www.snackquests.shop', keyId: process.env.SQ_KEY_ID!, secret: process.env.SQ_SECRET! });
const connected = await sq.connect({ manufacturerMachineId: 'NV-0001', firmwareVersion: '4.2.1' });
if (!connected.ok) throw new Error(`connect refused: ${connected.error?.code}`); // e.g. machine_not_provisioned
const machineCode = connected.data!.machineCode;   // SQ-MCH-000001, used in every later URL
```

机器描述包含 `pollIntervalSeconds`、`heartbeatIntervalSeconds`、您的能力列表，以及每个货道的价格和是否启用。请定期重新读取（规范第 5.2 节）。

### 5.2 上报：心跳、状态、库存、事件

```ts
await sq.heartbeat(machineCode, { eventId: newEventId('hb'), uptimeSeconds: 86400 });
await sq.status(machineCode, { eventId: newEventId('st'), online: true, doorOpen: false, temperatureCelsius: 6.5, faults: [] });
await sq.inventory(machineCode, { reportId: newEventId('inv'), slots: [{ slotId: 'motor-01', quantity: 6 }] });
await sq.events(machineCode, { events: [{ eventId: newEventId('ev'), type: 'DOOR_OPENED' }] });
```

- 每条上报都带有一个 `eventId`（库存上报为 `reportId`），每次发生的事情各不相同。请把它与未发送的上报一起持久化保存，并在每次重试时发送**相同的** ID。Snack Quest 只会计算一次。
- 发送 `occurredAt` 时请带明确的时区偏移（`2026-09-27T09:14:05+03:00`）或 `Z`。不带时区偏移的时间戳会被忽略，系统改用 Snack Quest 收到上报的时间（规范第 7 节）。
- 心跳响应中可能包含 `reportOutcomes`：Snack Quest 仍在等待结果的出货指令。请严格按照规范第 5.3 节中的表格，根据您的持久化存储逐一回复。简而言之：重新发送已保存的结果；只有当您的存储能证明该指令从未执行时，才上报 `failed`（"not executed"）。如果记录已丢失，请上报 `unknown`。
- 每份库存上报中，同一个货道最多出现一次。

### 5.3 出货循环

这是涉及资金和商品流转的部分，请严格遵照执行：

```
every nextPollSeconds:
  resend anything in the outbox (same eventId)
  for each command in GET …/commands:
    executed before (commandId in your store)?  → skip; never run it twice
    type you don't implement?                   → ack, report failed "unsupported command"
    ack → anything but 200?                     → do NOT dispense
    store "commandId: executing"                → BEFORE the motor turns
    dispense
    store the outcome, put the report in the outbox, send it
on boot:
  anything stored as "executing" and never finished → report unknown ("power lost during dispense")
```

使用 TypeScript 客户端：

```ts
import { runPollCycle, type OutboxStore } from './snackQuestMachine';

const hardware = {
  async dispense(slotId: string) {
    const result = await motor.vend(slotId);               // your firmware
    if (result.dropSensorConfirmed) return { outcome: 'dispensed' as const };
    if (result.jammed) return { outcome: 'failed' as const, failureCode: 'jam', reason: result.detail };
    if (result.slotEmpty) return { outcome: 'failed' as const, failureCode: 'no_product' };
    return { outcome: 'unknown' as const, reason: 'drop sensor did not confirm' }; // never guess "dispensed"
  },
};
const outbox: OutboxStore = persistentOutbox('/var/lib/sq/outbox.json');  // yours: must survive a reboot

let wait = 10;
for (;;) {
  const { nextPollSeconds } = await runPollCycle(sq, machineCode, hardware, outbox);
  wait = nextPollSeconds;
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
}
```

`runPollCycle` 负责处理待发队列（outbox）、确认规则以及未知的指令类型。它无法替您完成的，是在重启之后仍保留**您自己的**已执行 `commandId` 记录。正是这份记录确保指令在重启后不会被执行两次。

`failureCode` 的取值：`jam`、`no_product`、`sensor_failure`、`timeout`、`machine_offline`、`failed`。只要无法判断商品是否已经掉出，就请使用 `unknown`。该情况会由人工处理，顾客绝不会为没有拿到的商品付费。

### 5.4 错误与重试

| 响应 | 处理方式 |
|---|---|
| `2xx` | 完成。将该上报从待发队列中移除 |
| `401 stale_timestamp` | 校正时钟偏差，重新签名后重试 |
| 其他 `401`、`403`、`404`、`409`、`422` | 不要盲目重试，请求本身有误。指令相关的 `409` 表示**不要执行该指令** |
| `429` | 等待 `Retry-After` 指定的秒数，使用新的 nonce 重新签名，以相同的 `eventId` 重试 |
| `5xx`、超时、网络错误 | 按退避策略重试（1 秒、2 秒、4 秒……最长 60 秒，并加入随机抖动），重新签名，使用相同的 `eventId` |

请在每条上报的日志中记录 `SQ-Request-Id`。Snack Quest 技术支持通过它查找您的请求。

### 5.5 开发沙箱控制接口

认证时，Snack Quest 通过一组由您托管的小型控制 API 远程驱动您的沙箱机器。具体说明见 [`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md#3-sandbox-control-endpoints)。请与客户端同步开发。没有它，认证测试将无法通过；它也是测试您自己改动的最快方式。

---

## 6. 模式 A 分步说明

### 6.1 Snack Quest 调用的 API

Snack Quest 为您编写的适配器要求您的 API 至少提供以下功能。如果您的 API 已有名称不同但功能相同的接口，请把文档发给我们；语义比路径更重要。Snack Quest 的参考适配器和 API 探测工具正是按此约定编写的：

| 调用 | 必须实现 |
|---|---|
| `GET /v1/machines/{yourMachineId}` | `200 { online, doorOpen?, temperatureC?, faults?, paymentDeviceOk?, serial?, model?, firmware? }`。未知机器返回 `404` |
| `PUT /v1/machines/{yourMachineId}/vends/{commandRef}`，请求体为 `{ slot }`，请求头为 `Idempotency-Key: {commandRef}` | **创建或返回**该引用号对应的出货。`2xx { accepted: true }` 表示已接受；`2xx`/`422 { accepted: false, reason }`、`400` 或 `404` 表示拒绝。再次发送相同的引用号时，必须返回同一笔出货，绝不能第二次出货 |
| `GET /v1/machines/{yourMachineId}/vends/{commandRef}` | `200 { state: pending \| dispensing \| dispensed \| failed, failureCode?, reason? }`。`404` 表示该出货请求从未到达 |

认证方式：Snack Quest 发送 `Authorization: Bearer {key}`，其中的密钥由您为每个环境分别签发给 Snack Quest。Snack Quest 加密保存该密钥，可以轮换（支持回滚）或吊销，且录入后不会再向任何人显示。您的基础 URL 必须是公网 HTTPS 地址；Snack Quest 会拒绝内网、回环地址以及云元数据地址。

Snack Quest 如何解读您的响应——请据此让您的响应含义明确：

| 您的响应 | Snack Quest 对该出货的判定 |
|---|---|
| `2xx { accepted: true }` | 已接受。等待结果 |
| `2xx`/`422 { accepted: false }`、`400`、`404` | 已拒绝。为顾客退款 |
| 连接被拒绝、DNS 或 TLS 失败 | 从未发出。使用相同的引用号重试，之后退款 |
| `408`、`429` | 未处理。使用相同的引用号重试（遵守最长 5 秒的 `Retry-After`），之后判定为未知 |
| `5xx`、超时、连接中断或响应不完整、响应体格式错误、`409`、重定向 | **未知。** 该出货可能已存在。Snack Quest 会用上面的 `GET` 查询，绝不会换用新的引用号重新发送 |

这就是 `PUT` 必须幂等、查询必须准确的原因。二者结合，才能保证超时之后既不会重复出货，也不会错误退款。

### 6.2 您发送的 Webhook

结果和事件通过带签名的 Webhook（规范第 8 节）发送到 Snack Quest 的 `POST /api/v1/webhooks/manufacturers/{your slug}`。请使用您的 **Webhook** 密钥，按照本指南第 4 节的方法签名：

```js
const delivery = JSON.stringify({
  id: 'whk_01J8Z6Q4M2',                       // unique per delivery
  events: [
    { id: 'evt_77', kind: 'vend.completed', machine: 'NV-0001', at: '2026-09-27T09:21:52+03:00', detail: { requestId: 'DSP-3F9A1C22' } },
  ],
});
const path = '/api/v1/webhooks/manufacturers/nairobi-vending';
await fetch(`https://www.snackquests.shop${path}`, {
  method: 'POST',
  headers: signedHeaders({ keyId: WEBHOOK_KEY_ID, secret: WEBHOOK_SECRET, method: 'POST', pathWithQuery: path, body: delivery }),
  body: delivery,
});
```

以上是参考格式。您也可以使用自己的格式，由适配器负责转换，前提是每次推送都包含：

- 推送 ID；
- 每个事件的 ID；
- 您的机器 ID；
- 事件类型；
- 对于出货结果，Snack Quest 在 `PUT` 中提供给您的引用号；
- 对于失败，原因代码。

除 `2xx` 外的任何响应都请重新推送（`200` 且 `duplicate: true` 同样表示停止）。

### 6.3 认证前探测您的 API

您的沙箱 API 上线后，Snack Quest 会对其运行 **API 探测工具**。该工具检查：错误的密钥会被拒绝；机器状态可以读取；未知的出货引用号返回 `404`；以及（在进行沙箱出货的情况下）同一引用号发送两次只会产生一笔可查询的出货。参见 [`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md#4-model-a-the-api-probe)。

---

## 7. 进入生产环境

1. 您的机型通过认证（[`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md)）。
2. Snack Quest 签发**生产**密钥（`sqk_live_…`）。请把它与生产基础 URL（`https://www.snackquests.shop`）一起部署，就像当初把沙箱密钥与沙箱 URL 一起部署一样；绝不要在生产固件中携带沙箱密钥或沙箱 URL。
3. 工作人员登记并激活您的生产机器。
4. 请留意响应中的 `SQ-Credential-Status: rotating`。它表示已签发新密钥，旧密钥将在 `SQ-Credential-Grace-Ends` 指定的时间失效。

如果机型的能力或固件行为发生变化，并且影响到认证检查清单中的任何一项，则需要重新认证。

---

## 8. 申请认证前的检查清单

- [ ] 签名能够复现 `signing-test-vectors.json` 中的每一个测试向量
- [ ] 每次尝试都使用新的 nonce 和签名；同一条上报的每次重试都使用相同的 `eventId`
- [ ] Secret 安全保存；从不写入日志；从不出现在手机或网页客户端中
- [ ] 在执行动作**之前**保存 `commandId`；指令绝不会执行两次，包括重启之后
- [ ] 确认请求的响应只要不是 `200`，就不执行该指令
- [ ] 只有在实际确认出货后才上报 `dispensed`；不确定时上报 `unknown`；货道为空时上报 `no_product`
- [ ] 未发送的上报在重启后仍然保留，并在机器重新联网后发送
- [ ] 对未知的指令类型先确认，再上报 `failed`（"unsupported command"）
- [ ] 按第 5.4 节处理 `stale_timestamp`、`429` 和 `5xx`
- [ ] 按规范第 5.3 节回复 `reportOutcomes`（记录丢失时上报 `unknown`，绝不上报 `failed`）
- [ ] 沙箱控制接口已部署，包括 `hold`、`retransmit`、`request-log` 和 `defer-report`（模式 B），或 API 探测已通过（模式 A）

*如有疑问，请联系您的 Snack Quest 对接工程师。*
