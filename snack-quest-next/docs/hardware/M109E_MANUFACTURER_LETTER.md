# M109E: questions for the manufacturer (send-ready)

**Status:** ready to send. **Not sent:** Snack Quest has to send it; Claude can't.

This letter gathers everything we need from the manufacturer before buying:
- the 18 questions from the [M109E compatibility audit §9](M109E_COMPATIBILITY_AUDIT.md#9-questions-for-the-manufacturer), which match Appendix A one for one;
- the documents listed in §8.1 C;
- the firmware requests in §8.1 E, asked as questions, not demands;
- the CRC misprints we confirmed while building the agent.

Fill in the bracketed fields, then send the English and Chinese versions together, in one message.

**Questions 1, 4, 7 and 10 decide the purchase.** Ask for those four answers in writing before any payment.

When answers arrive, record them in the audit's §9, next to each question. Then re-read §5.4, which depends on Q1, and §12. A written answer does not replace the matching physical test in §10. For example, the answer to Q1 is confirmed only when S7 passes.

---

## English

**Subject:** M109E controller: technical questions before purchase — [Company name]

Dear [Manufacturer contact],

We are Snack Quest, a vending operator in Nairobi, Kenya. We are considering buying [quantity] machines fitted with your M109E drive board, starting with one machine for testing.

We have studied your M109E communication protocol document closely. We plan to run our own software on the machine's host computer and to drive the board over its serial protocol. Before we buy, we need written answers to the questions below.

Questions 1, 4, 7 and 10 are the most important to us.

**Protocol and behaviour**

1. When is a motor result (the Z1–Z10 values returned by 03H) cleared? Is it cleared when 03H is read, by a separate clear command, by a timer, or not until the next run?
2. After the board loses power and restarts, what does 03H return? Is the result of the last run kept?
3. Is the motor index range 0–59 (as for 05H) or 0–99 (as for 03H, 2AH and 2BH)? How does an index map to a physical tray and column? Is it row × 10 + column?
4. Is a light curtain fitted as standard on the model we would buy? What is the smallest item it reliably detects? Must it be powered with 0BH before a run in mode 1 or mode 2?
5. Can Z10 exceed 200 ms? How is a fall that takes longer than 200 ms reported?
6. Which physical interface does our board use: TTL, RS-485 or RS-232? Is it 8 data bits?
7. What is the host computer: model, operating system and version? Can we install our own application and get access to the serial port (device path, permissions or root)? Can we remove or disable your application?
8. What do the 12 ID bytes returned by 01H contain? Is the ID unique for each board?
9. What are DI1–DI4 connected to? Is there a door switch?
10. Does the board run the refrigeration logic in §5.8 by itself? How is the target temperature set? What happens if the host stops sending commands?
11. How many digital outputs are there, and how are they numbered? The document mentions 4 outputs, 5 names and indexes 0–6. What is each output's state at power-on?
12. For a time-controlled lock, is the hold time in Y6 or Y7? The table in §5.3 and the example in §6 disagree.
13. What is the exact frame for Set Address (FFH)? §5.13 and the example in §6 disagree.
14. Is there a command to read the firmware version? How are firmware updates delivered?
15. While our host is the bus master, can any other device, such as your application, also send commands on the bus?
16. Please send real captured frames for 2AH and 2BH. Three CRCs printed in the document don't match CRC16-MODBUS, which every other example follows:
    - 2AH reply `00 2A 01 00 … 00`: printed `11 89`, we calculate `8F 1C` (the §6 example prints `8F 1C`).
    - 2BH request for row 0 `01 2B 00 … 00`: printed `1F 70`, we calculate `4E E0`.
    - 2BH reply with ten switches closed `00 2B 01 01 01 01 01 01 01 01 01 01 00 … 00`: printed `12 89`, we calculate `69 AA`.
17. If the host stops communicating while a motor is running, does the motor stop by itself?
18. On over-current (0x01) and timeout (0x03), can a product still drop?

**Documents we would like**

- Sections 1–3 of the manual: hardware, connectors and wiring.
- Specifications of the host computer board.
- DI and DO wiring diagrams.
- The motor index map (index → tray and column).
- The board's firmware version and changelog.
- A statement of whether refrigeration is controlled by the board or by the host.
- The power-on default of every digital output.

**Firmware features we would value** (not conditions of purchase; please tell us which exist or could be added)

- An operation or sequence ID, sent with 05H and echoed in 03H.
- An explicit "clear result" command.
- The last run's result kept across a power loss.
- A command that returns the firmware version.
- A documented door-switch input.
- A board-controlled thermostat with a set-point command and a safe default when the host is silent.

Thank you. We look forward to your answers. Written answers to questions 1, 4, 7 and 10 would let us move ahead with the purchase.

Kind regards,
[Name]
[Title], Snack Quest
[Phone] · [Email]

---

## 中文

**主题：** M109E 驱动板采购前技术问题 —— [公司名称]

尊敬的[厂家联系人]：

我们是 Snack Quest，一家位于肯尼亚内罗毕的自动售货机运营商。我们计划采购[数量]台配备贵司 M109E 驱动板的售货机，并将首先采购一台用于测试。

我们已仔细研究了贵司的 M109E 通讯协议文档。我们计划在售货机主机上运行自己的软件，通过串口协议直接控制驱动板。采购前，我们需要贵司书面回复以下问题。

其中第 1、4、7、10 题对我们最为重要。

**协议与行为**

1. 电机运行结果（03H 返回的 Z1–Z10）在什么情况下会被清除？是读取 03H 后自动清除、需要单独的清除指令、超时自动清除，还是直到下一次运行才清除？
2. 控制卡断电重启后，03H 返回什么？是否保存上一次运行的结果？
3. 电机索引范围到底是 0–59（05H）还是 0–99（03H、2AH、2BH）？索引与实际层/列位置如何对应？是否为“层号×10+列号”？
4. 我们采购的型号是否标配光幕？光幕能可靠检测的最小商品尺寸是多少？模式 1/2 运行前是否必须先用 0BH 打开光幕电源？
5. Z10 是否可能超过 200 ms？商品掉落时间超过 200 ms 时如何表示？
6. 我们的控制卡使用哪种物理接口（TTL、RS‑485 还是 RS‑232）？数据位是 8 位吗？
7. 主机是什么设备？型号、操作系统及版本？我们能否安装自己的应用、获得串口访问权限（设备路径、权限或 root），并卸载或停用贵方应用？
8. 01H 返回的 12 字节 ID 的格式是什么？每块控制卡是否唯一？
9. DI1–DI4 分别连接什么？是否有门控开关？
10. 制冷逻辑（第 5.8 节）是否由控制卡自动执行？目标温度如何设置？主机停止通讯时会怎样？
11. 开关量输出一共有几路？编号如何（文档中有 4 路、5 个名称、0–6 三种说法）？上电时各路默认状态是什么？
12. 时间控制型电磁锁的动作时间是在 Y6 还是 Y7？（第 5.3 节表格与第 6 节示例不一致）
13. 设置地址（FFH）的准确帧格式是什么？（第 5.13 节与第 6 节示例不一致）
14. 是否有读取固件版本的指令？固件如何升级？
15. 在我们的主机作为主站时，总线上是否还有其他设备（例如贵方应用）会发送指令？
16. 请提供 2AH 和 2BH 的真实抓包数据。文档中有三处 CRC 与 CRC16‑MODBUS 不符（其他示例均符合）：
    - 2AH 应答 `00 2A 01 00 … 00`：文档印为 `11 89`，我们计算为 `8F 1C`（第 6 节示例印为 `8F 1C`）。
    - 2BH 请求（第 0 行）`01 2B 00 … 00`：文档印为 `1F 70`，我们计算为 `4E E0`。
    - 2BH 应答（十个开关闭合）`00 2B 01 01 01 01 01 01 01 01 01 01 00 … 00`：文档印为 `12 89`，我们计算为 `69 AA`。
17. 如果主机在电机运行过程中停止通讯，电机会自行停止吗？
18. 过流（0x01）和超时（0x03）时，商品是否仍可能掉落？

**希望获得的资料**

- 说明书第 1–3 章（硬件、接口与接线）。
- 主机主板规格。
- DI 与 DO 接线图。
- 电机索引对照表（索引 → 层/列）。
- 控制卡固件版本及更新记录。
- 制冷由控制卡还是主机负责的说明。
- 每一路开关量输出的上电默认状态。

**我们希望具备的固件功能**（并非采购条件；请告知哪些已具备或可以增加）

- 操作序号：随 05H 下发，并在 03H 中返回。
- 明确的“清除结果”指令。
- 断电后仍保存最后一次运行结果。
- 读取固件版本的指令。
- 有文档说明的门控开关输入。
- 由控制卡执行的温控：支持设定温度指令，并在主机停止通讯时进入安全默认状态。

感谢贵司的支持，期待您的回复。若能先书面回复第 1、4、7、10 题，我们即可推进采购。

此致
敬礼

[姓名]
[职位]，Snack Quest
[电话] · [邮箱]
