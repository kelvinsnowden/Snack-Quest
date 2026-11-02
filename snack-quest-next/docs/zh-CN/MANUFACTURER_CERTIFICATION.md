# Snack Quest 制造商认证

**机型在通过 Snack Quest 销售之前如何获得认证**

认证**按机型**进行，在**沙箱环境**中完成，最后由 Snack Quest 工程师审核证据并签字确认。对于未通过认证的机型，Snack Quest 不会签发生产密钥，也不会激活生产机器。机型的能力或行为发生变化后，需要重新认证。

请结合规范（[`SNACK_QUEST_MACHINE_API_V1.md`](SNACK_QUEST_MACHINE_API_V1.md) 第 12 节）和[对接指南](MANUFACTURER_INTEGRATION_GUIDE.md)阅读本文档。

---

## 1. 检查清单

以下是针对您的机型记录的检查项。每一项都需要**证据**（认证测试运行 ID、沙箱交易编号、日志或视频），没有证据的检查项无法记录。*来源*说明了谁可以记录该项：

- **harness**：自动化认证测试工具，根据对您机器的一次测试运行记录；
- **engineer**：Snack Quest 工程师，根据您与工程师共同收集的证据记录；
- **harness only**：只能由测试工具记录，任何人都无法手动记录。

| 检查项 | 验证内容 | 来源 |
|---|---|---|
| 身份验证 | 签名请求被接受；nonce 没有被复用；时间戳在 ±300 秒以内；测试运行期间没有身份验证失败 | harness（AUTHENTICATION + REPLAY PROTECTION）或 engineer |
| 机器登记 | `connect` 将您的机器 ID 映射到正确的 Snack Quest 机器 | harness（CONNECT）或 engineer |
| 心跳 | 心跳按时到达，Snack Quest 判定机器在线 | harness（HEARTBEAT）或 engineer |
| 状态上报 | 状态快照到达，并包含门、温度和故障信息 | harness（STATUS）或 engineer |
| 库存 | 库存上报到达，并与台账进行比对；上报数量与实际货道是否一致由工程师核查。不具备 `inventory_read` 能力的机型为*不适用* | harness（INVENTORY）或 engineer |
| 商品 / 货道映射 | 您的每个货道 ID 都能驱动其映射到的实际货道 | engineer |
| 出货指令 | 指令被领取，在上报任何结果之前**先确认**，确认被拒绝后绝不执行 | harness（COMMAND POLLING + ACKNOWLEDGEMENT）或 engineer |
| 出货确认 | 一笔已支付的销售以 `dispensed` 结束，并产生一次库存变动 | harness（DISPENSE）或 engineer |
| 出货失败 | 从空货道发起的销售以 `failed` 结束：为顾客退款，库存不变 | harness（FAILURE HANDLING）或 engineer |
| 幂等性 | 重新发送的结果上报被识别为同一条上报，只计算一次；同一条指令被送达两次时，只执行并上报一次 | harness（IDEMPOTENCY + DUPLICATE DELIVERY）或 engineer |
| 错误处理 | 4xx 与 5xx 的处理方式符合规范第 4.2 节 | engineer |
| Webhook | 带签名的推送、重新推送、去重。不使用 Webhook 时为*不适用* | engineer |
| 支付流程 | 一笔已支付的沙箱销售完成出货，并得到端到端确认 | harness（DISPENSE）或 engineer |
| 对账 | 在机器持有期间过期的指令绝不会被执行；未能发送的结果上报被保留，并在之后的周期中送达 | harness（TIMEOUT HANDLING + OFFLINE RECOVERY）或 engineer |
| 自动化契约测试套件 | 针对您机型的一次完整测试运行，结论为 CERTIFIED | **harness only** |

最后一项正是自动化测试工具不可或缺的原因：仅凭手动记录的证据，机型无法通过认证。另外两条规则：

- 如果机型声明支持库存上报，则**库存**一项不能标记为*不适用*；如果您通过 Webhook 推送，则 **Webhook** 一项不能标记为*不适用*。
- 认证被**撤销**后，重新认证需要一次新的测试运行：撤销之前记录的通过结果不再有效。

---

## 2. 自动化认证测试工具（模式 B）

Snack Quest 在其沙箱部署上运行测试工具，测试对象是您的一台**沙箱**机器——该机器与您获得的沙箱基础 URL 通信。测试工具从不针对生产环境运行，也拒绝在生产部署上运行。

**测试运行之前**

- 您的沙箱机器已登记，其沙箱对接处于激活状态。
- 有一个已启用的货道在 Snack Quest 台账上至少有 4 件商品，且实际至少装有 3 件（在清空该货道之前会有三笔销售出货）。
- 您的沙箱控制接口（第 3 节）已部署，并可通过 HTTPS 访问。

**测试脚本。** 测试工具按顺序执行以下步骤；每当机器需要动作时，就调用 `POST /cycle` 推进您的机器：

1. **启动。** 运行一个周期（如有需要先连接，然后心跳、状态、库存、轮询），随后触发一对开门 / 关门事件。
2. **一笔销售。** 从测试货道发起一笔已支付的沙箱销售。机器必须领取指令、确认、出货，并上报 `dispensed`。随后测试工具要求机器原样**重发**最后一条结果上报。
3. **同一条指令送达两次。** 测试工具再次发起销售，并要求机器**暂存**下一条指令（领取但暂不执行）；下一个周期的轮询会再次送达同一条指令。机器必须只执行并上报**一次**：同一条指令出现两条结果上报，即说明执行了两次。
4. **离线恢复。** 测试工具再次发起销售，并要求机器**推迟**下一条结果上报，模拟正要发送时网络中断。机器完成出货并保留该上报；该周期结束后，Snack Quest 此时还不应收到结果，而下一个周期必须把结果送达。
5. **无法完成的销售。** 测试工具要求机器把测试货道**清空**，然后从该货道发起销售。机器必须确认、尝试出货，并上报 `failed`（`no_product`）。
6. **在机器手中过期的指令。** 测试工具再次发起销售，并要求机器**暂存**下一条指令：领取但暂不执行。测试工具在服务器端让该指令过期，然后运行一个周期。机器必须尝试确认，收到 `409 command_expired`，并且**不**出货。

**判定方式。** 每一项检查都依据 Snack Quest 自己的记录来判定：出货台账、资金台账、库存变动、事件和信号。机器自己的声明从不作为证据；对空货道上报 `dispensed` 的机器将判定为不通过。检查项如下：

```
CONNECT  AUTHENTICATION  HEARTBEAT  STATUS  INVENTORY  EVENTS
COMMAND POLLING  ACKNOWLEDGEMENT  DISPENSE  FAILURE HANDLING
IDEMPOTENCY  REPLAY PROTECTION  TIMEOUT HANDLING
DUPLICATE DELIVERY  OFFLINE RECOVERY
```

**结论**只有在每一项检查都通过时才为 CERTIFIED。每一项未通过的检查都会列出观察到的情况，例如：

```
ACKNOWLEDGEMENT: history: sent → dispensing → dispensed
```

上例说明机器在未确认的情况下就上报了结果。

如果某项检查因缺少控制接口而无法驱动机器完成，该项为**未验证**，绝不会算作通过，因此该次运行的结论为 NOT CERTIFIED。当 Snack Quest 把一次运行记录到您的机型时，每个检查清单项都会以该次运行作为证据。只有结论为 CERTIFIED 的运行，才会把*自动化契约测试套件*一项记录为通过。测试检查未验证的清单项将留给工程师处理。

Snack Quest 自己的模拟机器也能通过同一套测试。它的运行结果绝不会作为任何制造商的证据。

---

## 3. 沙箱控制接口

这是模式 B 制造商为认证需要额外开发的唯一内容：在您这一侧提供的一个小型 HTTPS API，使测试工具能够按照上述脚本驱动您的沙箱机器（真实机器或模拟机器均可）。

- **基础 URL**：由您提供，公网 HTTPS 地址（例如 `https://sandbox.example.com/sq-control/NV-0001`）。内网地址和回环地址会被拒绝。
- **身份验证**：`Authorization: Bearer {control token}`。测试运行时，请把该令牌交给您的 Snack Quest 工程师。请使用只能控制沙箱机器的令牌。
- **行为**：每个调用都同步执行，动作完成后才返回。每个调用必须在 **30 秒**内完成。任何非 2xx 的响应都会导致该步骤失败。

| 接口 | 作用 | 响应 |
|---|---|---|
| `GET /capabilities` | 列出该机器支持的可选控制功能 | `{ "supports": ["hold", "retransmit", "request-log", "defer-report"] }` |
| `POST /cycle` | 一个正常周期：如有需要先连接，然后心跳、状态、库存，再对每条指令执行 轮询 → 确认 → 出货 → 上报，与机器自行运行时完全一致 | 周期完成后返回 `2xx` |
| `POST /door-events` | 打开再关闭维护门（或完全按照门的实际行为，先后发出 `DOOR_OPENED` 和 `DOOR_CLOSED`） | `2xx` |
| `POST /empty-slot`，请求体为 `{ "slotId": "motor-07" }` | 清空该货道，使下一次从该货道出货时以 `no_product` 失败 | `2xx` |
| `POST /hold-next-commands` | 立即轮询并保留指令，但不确认也不执行；下一次 `/cycle` 按正常流程处理它们（先确认，确认被拒绝则不执行） | `2xx` |
| `POST /retransmit-last-report` | 原样重发最后一条结果上报（相同的请求体、相同的 `eventId`，重新签名） | `{ "status": <HTTP status Snack Quest answered>, "result": <data.result from that answer> }` |
| `GET /request-log` | 机器发送给 Snack Quest 的每一个签名请求 | `[ { "nonce": "…", "timestamp": 1790500000 }, … ]` |
| `POST /defer-next-report` | 下一次出货正常完成，但不发送其结果上报——模拟网络中断，将其保留在机器的存储中——并在之后的周期中发送 | `2xx` |

**CERTIFIED 结论要求全部四项可选控制功能（`hold`、`retransmit`、`request-log`、`defer-report`）。** 之所以称为可选，只是因为没有它们测试工具也能运行，并报告它能验证的部分，这在开发过程中很有用。

控制接口可以使用模拟机器，前提是模拟机器运行的是您真实的固件逻辑（存储、待发队列、签名、确认规则）。模拟无法证明的实物检查项，将与您的工程师一起在真实机器上验证：

- 商品 / 货道映射；
- 出货确认；
- 掉货检测传感器。

---

## 4. 模式 A：API 探测工具

对于模式 A（Snack Quest 调用您的 API），Snack Quest 首先使用 **API 探测工具**检查您的沙箱 API。探测工具使用您签发给 Snack Quest 的沙箱密钥，执行以下检查：

| 检查项 | 通过条件 |
|---|---|
| 错误的 API 密钥被拒绝 | 故意使用错误的密钥时返回 `401`/`403` |
| 可以读取机器状态 | `GET /v1/machines/{id}` 返回 `200`，并带有布尔值 `online` |
| 未知出货返回 `404` | `GET …/vends/{unknown reference}` 返回 `404`，从而能够证明"从未到达" |
| 出货被接受 *（仅限沙箱出货）* | `PUT …/vends/{reference}` 返回 `2xx { accepted: true }` |
| 同一引用号发送两次只产生一笔出货 *（仅限沙箱出货）* | 重复的 `PUT` 对同一笔出货返回 `2xx { accepted: true }`。机器是否只出货一次，由现场观察人员确认 |
| 可以查询该出货 *（仅限沙箱出货）* | `GET …/vends/{reference}` 返回 `200`，并带有已知的 `state` |

如果不进行沙箱出货，三项出货检查会被报告为跳过，而不是通过。会触发出货的探测被禁止针对生产环境运行。

**模式 A 的认证现状。** 第 2 节的测试工具用于驱动模式 B 机器。模式 A 机型需要 Snack Quest 为其开发两样东西，而这两样目前尚未为任何制造商开发：

- 针对您的 API 编写的生产适配器。Snack Quest 的参考适配器是仅限沙箱使用的模板；
- 通过该适配器运行的认证测试，用于记录*自动化契约测试套件*一项。

在这两样都具备之前，模式 A 对接可以在沙箱中使用探测工具进行开发和测试，但无法获得生产环境认证。请与您的对接工程师规划适配器的开发工作。

---

## 5. 认证之后

- Snack Quest 签发生产密钥，并激活您的生产机器。
- 该机型的检查清单，连同每一份证据及其记录人，都会存档。
- 撤销认证（例如在出现严重的现场缺陷之后）会停止该机型新的生产激活。

*如有疑问，请联系您的 Snack Quest 对接工程师。*
