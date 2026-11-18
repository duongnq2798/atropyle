# Atropyle — contracts

Vault thừa kế và khôi phục ví không giữ tài sản, chạy trên X Layer (chainId 196). Mọi chuyển trạng thái do circuit `AtropylePolicy v1` của processor TapeOut `ATRO` quyết định qua `step()`. Vault không có admin, pause, upgrade, `delegatecall` hay `selfdestruct`.

## Cấu trúc

| Đường dẫn | Vai trò |
|---|---|
| `src/AtropyleVault.sol` | Vault (clone EIP-1167), mỗi chủ ví một cái |
| `src/AtropyleFactory.sol` | Tạo vault, thu phí, chỉ mục vai trò |
| `src/vault/VaultConfig.sol` | Cấu hình và ràng buộc |
| `src/vault/VaultDistribution.sol` | Phân phối chịu lỗi (token blacklist, phí chuyển, không trả `bool`) |
| `src/PolicyCodec.sol` | Định dạng bit state/input/output của policy |
| `circuits/*.json` | Netlist sinh từ `../circuits`, không sửa tay |
| `script/` | Script deploy 01–05 |
| `script/lib/` | Luồng tape-out dùng chung cho script và fork test |

## Lệnh

```bash
forge build --sizes
forge test
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv
forge snapshot --no-match-test "invariant_|testFuzz_"
```

So với snapshot đã ghi: `forge snapshot --no-match-test "invariant_|testFuzz_" --check --tolerance 1`. Ba test đọc file circuit (`test_realTemplateRoundTrips`, `test_mockCpuSpeaksTheWireFormat`, `test_modelMatchesCircuitVectors`) có gas lệch khoảng 0,3% tuỳ độ dài đường dẫn thư mục checkout, nên cần `--tolerance`. Dòng `ForkTest:setUp() (gas: 0)` trong snapshot là test fork bị bỏ qua khi không có `XLAYER_FORK_RPC`.

Sinh lại netlist (chạy ở gốc repo): `npm run export -w circuits`. Test `export.test.ts` báo lỗi nếu file trong `contracts/circuits/` lệch với builder.

Chứng minh exhaustive 2^26 = 67 108 864 tổ hợp: `npm run prove -w circuits` (khoảng 88–112 giây dưới `tsx` trên máy dev; `npm test -w circuits` chạy cùng phép quét trong khoảng 18 giây).

## Số đo

| Hạng mục | Giá trị | Cách đo |
|---|---|---|
| Gate của AtropylePolicy v1 (đã làm phẳng) | 199 (196 NAND + 3 LATCH; lớp riêng 89 NAND + 3 LATCH + 3 REF, netlist 800 byte) | `npm run export -w circuits`, `circuitInfo` trên fork |
| Gate của KofN5 / Ge4 | 41 / 25 | `circuitInfo` trên fork |
| Gas một lần `step` (fork X Layer) | 624 406 | `ForkTest.test_stepGas` |
| Gas `distribute()` xấu nhất, 20 tài sản × 5 người | 3 385 904 | `test_worstCaseGasUnderSixMillion` (unit test, một số slot đã warm; ngân sách < 6 triệu) |
| Runtime bytecode Vault / Factory | 15 516 / 4 039 byte (giới hạn 24 576) | `forge build --sizes` |
| Một vòng đời Drill trên fork (6 giao dịch) | 3 736 276 | `ForkTest.test_drillLifecycleGas`; mỗi giao dịch `poke`/`attestDeath`/`distribute` khoảng 0,66–0,78 triệu |
| Chi phí tạo processor và 3 circuit | 0,14 BEM (0,1 `createCPU` + 4 lần mint × 0,01) + 0,0039 OKB phí tape-out (3 × 0,0013) | `ForkTest.test_tapeoutBudget` |
| Gas từng bước 01 / 02 / 03 / 04 / 05 | 845 944 / 989 095 / 852 598 / 4 553 395 / 1 104 004 | diễn tập trên anvil fork (phần "Diễn tập") |

## Triển khai mainnet

Bạn tự ký mọi giao dịch bằng keystore Foundry. Không dán private key vào lệnh, file hay chat. Ví deployer cần ít nhất 0.2 BEM và 0.02 OKB, và phải là địa chỉ ví thường (EOA không có code, kể cả code EIP-7702): processor mint transistor ERC-1155 thẳng về ví đó. Ví đã nâng cấp smart account theo EIP-7702 (ví dụ qua OKX Wallet) có code `0xef0100…`; nếu để nó đi tiếp, bước 02 sẽ lỗi `ERC1155InvalidReceiver` (`0x57f447ce`) sau khi bước 01 đã tốn 0,1 BEM và creator của processor đã bị cố định vào ví đó. Vì vậy script 01, 02 và 03 dừng ngay với lỗi `DEPLOYER has code (EIP-7702 delegation?)` trước khi tiêu bất cứ thứ gì. Kiểm trước, và kiểm lại giữa các bước (ví có thể bị nâng cấp giữa chừng):

```bash
cast code $DEPLOYER --rpc-url xlayer   # phải in 0x
```

Chuẩn bị một lần:

```bash
cast wallet import atropyle-deployer --interactive
export DEPLOYER=0x...     # địa chỉ của keystore vừa nhập (hoặc: cast wallet address --account atropyle-deployer)
export TREASURY=0x...     # ví nhận phí tạo vault; bất biến sau bước 04
export SMOKE_HEIR=0x...   # một ví khác DEPLOYER, làm heir cho vault Drill thử
```

Dùng một shell riêng cho mainnet. Đừng dùng lại shell đã chạy phần "Diễn tập": biến `TREASURY` hay `DEPLOYER` còn sót lại từ đó (địa chỉ tài khoản anvil, khoá công khai) sẽ thành treasury bất biến của factory nếu bạn quên đặt lại.

Chạy lần lượt trong `contracts/`. Mỗi script in dòng `export …`; dán dòng đó vào terminal trước khi chạy script kế tiếp.

| # | Script | Cần env | In ra |
|---|---|---|---|
| 1 | `01_CreateProcessor` | `DEPLOYER` (`ATRO_CPU` phải chưa đặt; `REPLACE_PROCESSOR` chỉ đặt khi bỏ processor cũ) | `ATRO_CPU` |
| 2 | `02_TapeOutSubs` | `DEPLOYER`, `ATRO_CPU` | `KOFN_ID`, `GE4_ID` |
| 3 | `03_TapeOutPolicy` | `DEPLOYER`, `ATRO_CPU`, `KOFN_ID`, `GE4_ID` (`POLICY_ID` phải chưa đặt) | `POLICY_ID` |
| 4 | `04_DeployAtropyle` | thêm `POLICY_ID`, `TREASURY` (`ATRO_FACTORY` phải chưa đặt) | `VAULT_IMPL`, `ATRO_FACTORY` |
| 5 | `05_SmokeDrill` | `DEPLOYER`, `ATRO_FACTORY`, `SMOKE_HEIR` | `SMOKE_VAULT` |

```bash
forge script script/01_CreateProcessor.s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow
```

Các bước 2–5 dùng đúng lệnh này, chỉ đổi tên file.

- Chạy trước một lần không có `--broadcast` (và không cần `--account`) để xem mô phỏng.
- RPC từ chối giao dịch EIP-1559 thì thêm `--legacy`.
- Mỗi script là một lượt broadcast riêng. Chuỗi địa chỉ và id không đoán trước được: địa chỉ processor phụ thuộc nonce của factory TapeOut, và ai cũng có thể tape-out lên processor của bạn. Vì vậy từng bước đọc đầu vào từ env (giá trị bước trước để lại) và tự kiểm lại trên chain, không có mô phỏng nào bao trùm nhiều bước.
- Script 01 không gửi gì nếu beacon circuits không phải bản đóng băng `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` (spec §2). Gặp lỗi `STOP: …` thì dừng hẳn và đánh giá lại. Script 02 và 03 kiểm lại điều này, cùng tên, ký hiệu và creator của processor, trước khi approve hay mint bất cứ thứ gì.
- Script 02 chạy lại được: nếu KofN5 đã lên chain, đặt `export KOFN_ID=…` rồi chạy lại. Script chỉ tape-out phần còn thiếu và chỉ mint số transistor còn thiếu. Ngược lại, chạy lại script 02 khi đã có đủ cả hai id mà không đặt `KOFN_ID` và `GE4_ID` sẽ tape-out và trả phí thêm một lần nữa (rẻ: một phí tape-out và vài lần mint).
- Script 01 chặn chạy lại theo hai lớp. Nếu `ATRO_CPU` đã đặt, nó dừng. Nếu mất env sau một lần chạy thành công, nó quét 100 processor mới nhất của factory TapeOut (`cpuCount()` / `cpuAt(i)`) tìm processor tên `Atropyle` do `DEPLOYER` tạo, rồi dừng và in địa chỉ đó: đặt `export ATRO_CPU=<địa chỉ đó>` và sang bước 02, đừng tạo cái thứ hai (0,1 BEM, và hồ sơ nộp bài nêu địa chỉ processor). Lần quét đọc khoảng 100 processor qua RPC nên mô phỏng bước 01 mất chừng một phút.
- Chạy 02 ngay sau 01, rồi 03 ngay sau 02. Spec §10 cố định `supplyCap = 10 000` (một trần chung cho cả NAND và LATCH) và `mintPrice = 0`, nên trong khoảng chờ giữa các bước, bất kỳ ai cũng có thể mint hết trần chỉ với phí giao thức. Khi đó 02 hoặc 03 dừng (không gửi gì), và processor đó không dùng được nữa.
- Chỉ trong trường hợp đó (hoặc khi processor `Atropyle` cũ của cùng ví là bản thử không dùng được), bỏ processor cũ bằng `REPLACE_PROCESSOR`. Script 01 chỉ tạo processor mới khi địa chỉ nó tìm thấy trùng đúng `REPLACE_PROCESSOR`, nên lệnh này nói rõ bạn bỏ cái nào; địa chỉ khác, hoặc đặt mà không tìm thấy processor nào, thì script dừng. Cái giá là thêm 0,1 BEM phí `createCPU`, processor cũ bị bỏ hẳn, và hồ sơ nộp bài phải nêu địa chỉ mới. Script in hai dòng `REPLACE_PROCESSOR: ABANDONING …` và `… creating a NEW processor …`; đọc kỹ ở bản mô phỏng trước khi thêm `--broadcast`:

  ```bash
  unset ATRO_CPU KOFN_ID GE4_ID POLICY_ID
  export REPLACE_PROCESSOR=0x...   # đúng địa chỉ script 01 vừa in trong lỗi "already exists"
  forge script script/01_CreateProcessor.s.sol --rpc-url xlayer --sender $DEPLOYER
  ```

  Xong bước 01 mới thì `unset REPLACE_PROCESSOR`.
- Script 04 dừng nếu `ATRO_FACTORY` đã đặt. Không chạy lại 04 khi chưa cần: nó sẽ deploy factory thứ hai và ghi đè `broadcast/04_DeployAtropyle.s.sol/196/run-latest.json`, file bản ghi mà bước ghi deployment của SDK đọc, khiến SDK lặng lẽ chuyển sang factory mới. Sau khi 04 chạy xong, sao lưu thư mục `broadcast/` rồi hãy làm việc khác.
- Script 04 in `deployer` và `treasury (immutable)` trước khi gửi. Trên chainId 196 nó từ chối nếu `TREASURY` hoặc `DEPLOYER` là một trong mười tài khoản mặc định của anvil (khoá riêng công khai, dấu hiệu env còn sót từ lần diễn tập). Treasury không đổi được sau khi deploy, nên đọc kỹ hai dòng đó ở bản mô phỏng.
- Script 03 kiểm `KOFN_ID` và `GE4_ID` khớp byte-for-byte với KofN5 và Ge4 trước khi mint; script 04 kiểm policy trên chain bằng netlist đã vá và 64 vector, rồi mới deploy. Id sai thì script dừng trong mô phỏng, không gửi giao dịch nào.
- Script 05 kiểm vault Drill trỏ đúng `cpu` và `policyId` của factory. `poke()` trong 05 do `DEPLOYER`, chủ vault, ký nên là một lần check-in; nó vẫn gọi `step()` trên circuit thật.

### Kiểm treasury trước bước 04

Treasury bất biến sau bước 04. Nếu một token phí (USDT0, USDC, USDG) chặn treasury (blacklist, đóng băng, tạm dừng), mọi vault trả phí bằng token đó sẽ revert mãi mãi. Trước bước 04, với `TREASURY` thật đã export, chạy trên fork (chỉ đọc, không gửi gì):

```bash
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest --match-test test_treasuryReceivesEveryFeeToken -vv
```

Test tạo một vault trả phí cho mỗi token phí trên fork và kiểm số dư treasury tăng đúng `currentFee`. Ba dòng `fee paid to treasury …` phải hiện ra và test phải PASS. Nếu test revert, treasury không nhận được token đó: chọn ví treasury khác, export lại `TREASURY` và chạy lại.

### Đọc lại từ chain sau mỗi bước

Dòng `export …` do forge in ra lấy từ mô phỏng, không phải từ receipt. Nếu có người tape-out chen vào giữa lúc mô phỏng và lúc gửi, id thật có thể khác id đã in. Sau mỗi bước, đọc lại từ chain rồi mới `export`:

```bash
# Sau bước 1: processor phải là của bạn
cast call $ATRO_CPU "name()(string)" --rpc-url xlayer                       # "Atropyle"
cast call $(cast call $ATRO_CPU "transistors()(address)" --rpc-url xlayer) "creator()(address)" --rpc-url xlayer   # = $DEPLOYER

# Sau bước 2: KofN5 và Ge4
cast call $ATRO_CPU "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" $KOFN_ID --rpc-url xlayer   # 8 1 0 41
cast call $ATRO_CPU "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" $GE4_ID --rpc-url xlayer    # 8 1 0 25
cast call $ATRO_CPU "ownerOf(uint256)(address)" $KOFN_ID --rpc-url xlayer                           # = $DEPLOYER
cast call $ATRO_CPU "ownerOf(uint256)(address)" $GE4_ID --rpc-url xlayer                            # = $DEPLOYER

# Sau bước 3: policy
cast call $ATRO_CPU "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" $POLICY_ID --rpc-url xlayer # 23 3 3 199
cast call $ATRO_CPU "ownerOf(uint256)(address)" $POLICY_ID --rpc-url xlayer                         # = $DEPLOYER

# Sau bước 4: factory trỏ đúng processor, policy, treasury và vault implementation
cast call $ATRO_FACTORY "cpu()(address)" --rpc-url xlayer                                           # = $ATRO_CPU
cast call $ATRO_FACTORY "policyId()(uint256)" --rpc-url xlayer                                      # = $POLICY_ID
cast call $ATRO_FACTORY "treasury()(address)" --rpc-url xlayer                                      # = $TREASURY
cast call $ATRO_FACTORY "vaultImpl()(address)" --rpc-url xlayer                                     # = $VAULT_IMPL

# Sau bước 5: vault Drill thử
cast call $SMOKE_VAULT "drill()(bool)" --rpc-url xlayer                                             # true
cast call $SMOKE_VAULT "state()(uint8)" --rpc-url xlayer                                            # 0 (Active)
```

Nếu một id đọc lại khác id đã in (có người tape-out chen vào), đừng dùng id in ra. Lấy id thật từ receipt của giao dịch `tapeout`: log `Transfer(address,address,uint256)` do Circuits phát ra có topic thứ 4 là id circuit (`cast receipt <tx> --rpc-url xlayer`, hoặc `broadcast/<script>/196/run-latest.json`). Hoặc đọc bộ đếm `cast call $ATRO_CPU "nextId()(uint256)" --rpc-url xlayer`, là id circuit mới nhất đã tape-out (đo trên fork: 3 sau ba lần tape-out từ processor mới); số này chỉ trùng id của bạn khi không ai tape-out chen vào sau bạn. Rồi kiểm `circuitInfo` và `ownerOf` như trên trước khi `export`.

Receipt đầy đủ nằm ở `broadcast/<script>/196/run-latest.json`. Hash giao dịch ghi vào `../docs/deployments.md`.

Kiểm deployment thật (chỉ đọc, chạy sau bước 4). Export đủ các biến sau, đúng giá trị đã đọc lại từ chain:

```bash
export DEPLOYER=0x... ATRO_CPU=0x... KOFN_ID=... GE4_ID=... POLICY_ID=...
export ATRO_FACTORY=0x... VAULT_IMPL=0x... TREASURY=0x...
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv
```

Có `ATRO_FACTORY` thì mọi test chạy trên chính factory đã deploy thay vì deploy factory mới trên fork, và kiểm `cpu()` = `ATRO_CPU`, `policyId()` = `POLICY_ID`, `treasury()` = `TREASURY`, `vaultImpl()` = `VAULT_IMPL`, cùng hai mức phí của cả ba token phí theo `decimals()` của từng token. Test khoá implementation chạy trên chính `VAULT_IMPL`. Thiếu `ATRO_CPU` mà có `ATRO_FACTORY` thì setUp dừng. `test_tapeoutBudget` báo SKIP ở chế độ này (nó chỉ đo khi tự tạo processor trên fork).

Verify trên OKLink. Để `OKLINK_API_KEY` trong `contracts/.env` (đã bị `.gitignore` chặn). Bash không tự đọc `.env`, nên nạp nó vào shell trước, nếu không `$OKLINK_API_KEY` sẽ rỗng:

```bash
set -a; source .env; set +a
forge verify-contract $VAULT_IMPL src/AtropyleVault.sol:AtropyleVault --chain 196 --verifier oklink --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER --verifier-api-key $OKLINK_API_KEY --watch
```

```bash
forge verify-contract $ATRO_FACTORY src/AtropyleFactory.sol:AtropyleFactory --chain 196 --verifier oklink --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER --verifier-api-key $OKLINK_API_KEY --constructor-args $(cast abi-encode "constructor(address,address,uint256,address,address[])" $VAULT_IMPL $ATRO_CPU $POLICY_ID $TREASURY "[0x779Ded0c9e1022225f8E0630b35a9b54bE713736,0xB6CEceAB302E2E4948951eE7843FC24E92933061,0x4ae46a509F6b1D9056937BA4500cb143933D2dc8]") --watch
```

Địa chỉ đã deploy ghi ở `../docs/deployments.md`.

## Diễn tập trên anvil fork

Chạy thử cả năm bước trước khi dùng tiền thật. Phải đặt `--chain-id 31337`: anvil fork mặc định báo chainId 196, khi đó `forge script --broadcast` ghi vào `broadcast/<script>/196/`, đúng thư mục các bước sau đọc như bản deploy mainnet thật.

Terminal 1:

```bash
anvil --chain-id 31337 --fork-url https://rpc.xlayer.tech
```

Terminal 2, trong `contracts/`. Mở một shell riêng cho phần này, không dùng chung shell với mainnet. Chỉ dùng tài khoản anvil mở khoá sẵn, không bao giờ đưa private key vào đây. Một số tài khoản mặc định của anvil đã bị gán code EIP-7702 trên mainnet (lúc viết: tài khoản 0, 1 và 5), nên fork cũng có code ở đó và script 01 sẽ từ chối. Kiểm tài khoản bạn chọn bằng đúng lệnh như với ví thật (`cast code $DEPLOYER --rpc-url $RPC` phải in `0x`) thay vì tin vào danh sách này; ví dụ dưới dùng tài khoản 2, 3, 4:

```bash
export RPC=http://127.0.0.1:8545
test "$(cast chain-id --rpc-url $RPC)" = "31337" || echo "KHONG PHAI ANVIL LOCAL"
export DEPLOYER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC   # tài khoản anvil số 2
export TREASURY=0x90F79bf6EB2c4f870365E785982E1f101E93b906   # tài khoản số 3
export SMOKE_HEIR=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 # tài khoản số 4
cast code $DEPLOYER --rpc-url $RPC                           # phải in 0x

# Cấp BEM cho deployer trên fork: mượn một địa chỉ đang giữ ít nhất 1 BEM (tra holder BEM trên OKLink)
export BEM_HOLDER=0x...
cast rpc anvil_impersonateAccount $BEM_HOLDER --rpc-url $RPC
cast rpc anvil_setBalance $BEM_HOLDER 0x56BC75E2D63100000 --rpc-url $RPC
cast send 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952 "transfer(address,uint256)" $DEPLOYER 200000000 --from $BEM_HOLDER --unlocked --rpc-url $RPC

forge script script/01_CreateProcessor.s.sol --rpc-url $RPC --unlocked --sender $DEPLOYER --broadcast --slow
```

Dán dòng `export ATRO_CPU=…` rồi chạy tiếp 02, 03, 04, 05 đúng lệnh trên, chỉ đổi tên file. `--unlocked` chỉ dùng với anvil local; trên mainnet luôn dùng `--account`. Diễn tập xong, tắt anvil, xoá bản ghi của lần diễn tập (`broadcast/*/31337`) để các bước sau không đọc nhầm, rồi xoá mọi biến của lần diễn tập (hoặc đóng hẳn shell này). Chỉ xoá thư mục `31337`: `broadcast/*/196/` là bản ghi deploy mainnet, `.gitignore` chặn nên không có bản nào khác, và bước ghi deployment của SDK đọc từ đó.

```bash
unset DEPLOYER TREASURY SMOKE_HEIR ATRO_CPU KOFN_ID GE4_ID POLICY_ID VAULT_IMPL ATRO_FACTORY SMOKE_VAULT BEM_HOLDER RPC REPLACE_PROCESSOR
rm -rf broadcast/*/31337
```

## Giới hạn đã biết

Các quyết định sau được chốt khi review. Không phải lỗi, nhưng người dùng và người tích hợp cần biết:

- Mỗi lời gọi ngoài trong `distribute()` có trần gas: view 100 000, ERC-20 `transferFrom` 300 000, ERC-721/1155 `safeTransferFrom` 500 000. Lời gọi view vượt trần thì đọc ra 0 và tài sản đó bị bỏ qua lặng lẽ (không có sự kiện); lời gọi chuyển vượt trần thì luôn thất bại với sự kiện `TransferFailed`. Cả hai trường hợp lượt quét vẫn đi tiếp. Giao dịch không đủ gas để cấp trọn trần cho lời gọi kế tiếp thì revert `InsufficientGas()`, để người gọi không thể bóp gas làm hỏng riêng phần chuyển của một người thừa kế.
- Phần ERC-20 chuyển thất bại (ví dụ người thừa kế bị blacklist) ở lại ví chủ và được chia lại theo bps cho tất cả người thừa kế ở các lượt quét sau. NFT và ERC-1155 của người đó vẫn nằm lại, không chuyển cho ai khác.
- Người thừa kế hoặc đích khôi phục có địa chỉ đã được gán code theo EIP-7702 thì được tính là có code: `safeTransferFrom` của ERC-721 và ERC-1155 gọi hook nhận của họ. Nếu code ủy quyền không có hook đó, lần chuyển thất bại với `TransferFailed`, tài sản ở lại ví chủ và được thử lại ở các lượt quét sau. ERC-20 không bị ảnh hưởng.
- Khi vault chưa Released, mọi giao dịch chủ ví ký đều là bằng chứng còn sống, kể cả `poke()` và `distribute()` (spec §3.2 bit 21, §4.5 I4): hai hàm này chạy như `checkIn()`, huỷ báo động, xoá phiếu và không bao giờ release. Vì vậy chủ ví không tự kích hoạt báo động được, Drill cũng vậy; khi demo bằng một ví, gọi `poke()` từ một địa chỉ khác hoặc để keeper gọi. Sau khi Released, `distribute()` do chủ ví ký vẫn quét tài sản như của bất kỳ ai.
- Người thừa kế và đích khôi phục không bao giờ là chính địa chỉ vault (vault không có hàm rút, tài sản chuyển vào sẽ kẹt vĩnh viễn).
- Trường hợp xấu nhất, 20 tài sản ERC-20 đều độc hại × 5 người thừa kế, tốn khoảng 28 triệu gas. Nếu X Layer sau này áp trần gas mỗi giao dịch thấp hơn nhiều mức đó (ví dụ 2^24 theo EIP-7825), một vault có từ khoảng 9 tài sản độc hại trở lên sẽ không quét được trong một giao dịch.
