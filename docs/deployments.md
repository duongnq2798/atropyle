# Atropyle — địa chỉ trên X Layer mainnet (chainId 196)

Mọi địa chỉ dưới đây do ví deployer của dự án tạo. Kiểm lại bằng `XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv` với các biến env tương ứng.

| Thành phần | Giá trị | Giao dịch |
|---|---|---|
| Deployer | — | |
| Processor `ATRO` (Circuits) | — | — |
| Transistors của `ATRO` | — | |
| Beacon circuits (đã đóng băng) | `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` | |
| Circuit `KofN5` | id — | — |
| Circuit `Ge4` | id — | — |
| Circuit `AtropylePolicy v1` | id — | — |
| `AtropyleVault` (implementation) | — | — |
| `AtropyleFactory` | — | — |
| Treasury | — | |
| Vault Drill thử | — | — |

Gas `step` đo trên mainnet: —

## Site DeWEB

Web app nằm trên DeWEB, trong container của một circuit neo trên chính processor `ATRO`. Bản máy đọc: [`deployments/deweb.json`](../deployments/deweb.json), sinh bằng `npm run deweb:site` (chỉ đọc chain). Chưa có gì được tape-out hay đăng trên mainnet: mọi ô "—" dưới đây chờ các bước 3 tới 6.

| Thành phần | Giá trị | Giao dịch |
|---|---|---|
| Circuit neo `0x00000002000002` (NAND, 1 cổng) | id — | — |
| Container (mở qua opener `0x536adD8F30f03b69f6fbF29d425A816A0dC50106`) | — | — |
| Tên chính tắc (bind 120 tháng, `value = 0`) | — | — |
| URL gateway (tự kiểm trong trình duyệt) | — | |
| URL gateway, chế độ tương thích (`-open`, gateway kiểm hộ) | — | |
| SiteRegistry | `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` | |
| DomainBinding | `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9` | |

Không có ví operator và không có khoá nào trong repo. Người ký duy nhất là ví deployer (giữ NFT circuit neo), qua keystore Foundry `--account atropyle-deployer` trên mainnet. Việc đăng file đi qua `npm run deweb:publish -- --emit`, rồi `forge script script/07_DewebPublish.s.sol`: `--emit` chỉ đọc chain và ghi file lệnh, forge ký bằng keystore của người dùng. Bước diễn tập (bước 2) chỉ gửi giao dịch tới một anvil fork ở `127.0.0.1`, không bao giờ tới mạng thật.

Mọi lệnh `forge`, `cast`, `curl` dưới đây chạy trong Git Bash. Các lệnh `npm run` chạy ở gốc repo, các lệnh `forge script` chạy trong `contracts/`.

### Runbook

Điều kiện: Plan 1 đã deploy xong trên mainnet và hai địa chỉ công khai `DEPLOYER`, `ATRO_CPU` có trong bảng ở đầu file này.

Mỗi khối code là một phiên shell riêng; chạy cả khối. Biến shell không mang sang khối sau, nên mỗi khối tự `export` những biến nó cần (`<...>` là giá trị bạn điền).

#### 1. [CLAUDE] Kiểm trước, chỉ đọc mainnet (sau khi deploy mainnet xong)

```bash
export RPC=https://rpc.xlayer.tech
export DEPLOYER=<địa chỉ deployer> ATRO_CPU=<địa chỉ ATRO>
cast call 0x536adD8F30f03b69f6fbF29d425A816A0dC50106 "FEE()(uint256)" --rpc-url $RPC
cast call $ATRO_CPU "TAPEOUT_FEE()(uint256)" --rpc-url $RPC
cast call 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "monthlyFee()(uint256)" --rpc-url $RPC
cast call 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 "CHUNK_MAX()(uint256)" --rpc-url $RPC
cast balance $DEPLOYER --rpc-url $RPC --ether
cast call 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952 "balanceOf(address)(uint256)" $DEPLOYER --rpc-url $RPC
```

Kỳ vọng:

- `FEE()` = `80000000000000000` (0,08 OKB); `TAPEOUT_FEE()` = `1300000000000000` (0,0013 OKB); `monthlyFee()` = `0`; `CHUNK_MAX()` = `24000`.
- OKB của deployer đủ cho: phí tape-out, phí opener 0,08 OKB, gas, và số OKB để đăng site mà dry run (bước 4) in ra. Số cuối chỉ biết sau bước 4; nếu thiếu thì nạp thêm trước bước 5.
- BEM đủ để mint một NAND (hoặc deployer đã có NAND thừa từ Plan 1).

Nếu một giá trị khác, dừng và báo người điều phối trước khi đi tiếp.

#### 2. [CLAUDE] Diễn tập trên anvil fork (sau khi deploy, trước bước 3 của người dùng)

Bước này chỉ gửi giao dịch tới anvil fork ở `127.0.0.1` (chain 196, tài khoản `DEPLOYER` được impersonate). Nó không gửi gì tới mạng thật và không cần khoá. Chọn một cổng loopback còn trống khác 8545 (ví dụ 8546). Export và `forge` chạy trong cùng một khối.

Rehearsal dùng `--emit` cộng forge/cast `--unlocked` vì `npm run deweb:publish -- --unlocked` từ chối mọi chain khác 31337, kể cả fork chain 196.

Chạy anvil trong terminal riêng của nó và để mở (dừng bằng Ctrl+C ở chính terminal đó, xem phần dọn dẹp):

```bash
anvil --fork-url https://rpc.xlayer.tech --port 8546
```

Khối tiếp theo chạy ở terminal khác:

```bash
export FORK=http://127.0.0.1:8546
export DEPLOYER=<địa chỉ deployer> ATRO_CPU=<địa chỉ ATRO>
cast rpc anvil_impersonateAccount $DEPLOYER --rpc-url $FORK
cd contracts
# lượt 1: tape-out circuit neo
forge script script/06_DewebSite.s.sol --rpc-url $FORK --unlocked --sender $DEPLOYER --broadcast --slow
# đặt DEWEB_TOKEN_ID bằng id mà lượt 1 in, rồi lượt 2: mở container
export DEWEB_TOKEN_ID=<n>
forge script script/06_DewebSite.s.sol --rpc-url $FORK --unlocked --sender $DEPLOYER --broadcast --slow
cd ..
```

Lượt 2 in `export DEWEB_CONTAINER=<địa chỉ>`; giá trị này chỉ dùng cho bước bind bên dưới (các khối sau tự export lại).

Ghi danh tính site của fork ra file tạm (không đụng `deployments/`), build, lập kế hoạch:

```bash
export FORK=http://127.0.0.1:8546
export ATRO_CPU=<địa chỉ ATRO> DEWEB_TOKEN_ID=<n>
npm run deweb:site -- --cpu $ATRO_CPU --token-id $DEWEB_TOKEN_ID --rpc $FORK --out site-dist/deweb-fork.json
npm run site:build -- --target deweb --no-docs
npm run deweb:publish -- --emit contracts/deweb-calls/fork.json --rpc $FORK --site site-dist/deweb-fork.json
```

`--emit` in keccak256 của file và hai lệnh (kiểm `show()` và broadcast). Chạy chúng trên fork: trong lệnh broadcast, thay `--account atropyle-deployer` bằng `--unlocked --sender $DEPLOYER`, và dùng `--rpc-url $FORK` cho cả hai lệnh.

```bash
export FORK=http://127.0.0.1:8546
export DEPLOYER=<địa chỉ deployer>
cd contracts
DEWEB_CALLS=deweb-calls/fork.json forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url $FORK
DEWEB_CALLS=deweb-calls/fork.json DEWEB_KECCAK=0x<hash> forge script script/07_DewebPublish.s.sol --rpc-url $FORK --unlocked --sender $DEPLOYER --broadcast --slow
cd ..
```

Nếu `--emit` chia site thành nhiều phần (mỗi file tối đa 1 MB dữ liệu): sau mỗi lần broadcast xoá file phần đó, chạy lại `--emit` cho phần kế, lặp tới khi dry run báo hết. Rồi bind và kiểm:

```bash
export FORK=http://127.0.0.1:8546
export DEPLOYER=<địa chỉ deployer> DEWEB_CONTAINER=<địa chỉ container của fork>
export DEWEB_NAME=$(node -p "require('./site-dist/deweb-fork.json').name")
cast send 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "bind(string,address,uint256)" "$DEWEB_NAME" $DEWEB_CONTAINER 120 --value 0 --from $DEPLOYER --unlocked --rpc-url $FORK
cast call 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "isLive(string,address)(bool)" "$DEWEB_NAME" $DEWEB_CONTAINER --rpc-url $FORK
cast call 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 "fallbackPath(address)(string)" $DEWEB_CONTAINER --rpc-url $FORK
npm run deweb:publish -- --dry-run --rpc $FORK --site site-dist/deweb-fork.json
```

Kỳ vọng: `deweb:site` ghi `name` = `<n>.2.<cpuIndex>.tape`; `bind` có `status 1 (success)`; `isLive` = `true`; `fallbackPath` = `"index.html"`; dry run in `Nothing to publish: the chain already has this site.`

Dọn dẹp: nhấn Ctrl+C trong terminal chạy anvil (chỉ anvil của bước này), rồi xoá phần dư ở terminal kia. Nếu đã chạy anvil nền với `anvil ... & ANVIL_PID=$!`, dừng bằng `kill "$ANVIL_PID"` trong cùng phiên shell đó.

```bash
rm -rf contracts/broadcast/06_DewebSite.s.sol/196 contracts/broadcast/07_DewebPublish.s.sol/196
rm -f contracts/deweb-calls/fork*.json site-dist/deweb-fork.json
```

Hai thư mục `broadcast/.../196/` của fork phải bị xoá: chúng là bản ghi của fork, không phải của mainnet. Nếu để lại, `run-latest.json` của fork có thể bị nhầm với bản của mainnet khi lấy hash giao dịch ở bước 3. Nếu diễn tập lộ lỗi, sửa script trước khi người dùng chạy bước 3.

#### 3. [USER] Tape-out và mở container trên mainnet

Trong terminal của người dùng, cùng keystore của Plan 1. Script chạy hai lượt; người dùng gõ mật khẩu keystore ở prompt của `forge`.

```bash
export DEPLOYER=<địa chỉ deployer> ATRO_CPU=<địa chỉ ATRO>
cd contracts
# lượt 1: tape-out circuit neo (chỉ chạy MỘT lần)
forge script script/06_DewebSite.s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow
```

Lượt 1 in `export DEWEB_TOKEN_ID=<n>`. Id đó lấy từ mô phỏng, nên kiểm trên chain trước khi đi tiếp: `cast call $ATRO_CPU 'ownerOf(uint256)(address)' <n> --rpc-url https://rpc.xlayer.tech` phải trả về địa chỉ deployer.

**Không chạy lại lượt 1.** Script không phát hiện được circuit neo đã tồn tại: chạy lần hai sẽ tape-out thêm một circuit neo (0,0013 OKB). Nếu id đã in (từ mô phỏng) hoá ra sai, hoặc lượt 1 lỡ chạy hai lần, lấy id thật từ log `Transfer` của `cast receipt <hash tape-out> --rpc-url https://rpc.xlayer.tech`, hoặc từ `contracts/broadcast/06_DewebSite.s.sol/196/run-latest.json`, rồi xác nhận bằng `cast call $ATRO_CPU 'ownerOf(uint256)(address)' <id> --rpc-url https://rpc.xlayer.tech`. Rồi:

```bash
export DEPLOYER=<địa chỉ deployer> ATRO_CPU=<địa chỉ ATRO>
cd contracts
export DEWEB_TOKEN_ID=<n>
# lượt 2: mở container (0,08 OKB)
forge script script/06_DewebSite.s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow
```

Lượt 2 từ chối chạy nếu circuit không thuộc về `DEPLOYER` hoặc netlist không phải circuit neo, và bỏ qua `open` nếu container đã có. Lượt 2 in `export DEWEB_CONTAINER=<địa chỉ>`.

Sau mỗi lượt, người dùng gửi cho Claude các giá trị công khai đã in (`DEWEB_TOKEN_ID`, `DEWEB_CONTAINER`) và hash của từng giao dịch (từ output của `forge`, hoặc từ `contracts/broadcast/06_DewebSite.s.sol/196/run-latest.json`).

#### 4. [CLAUDE] Ghi danh tính site, đổi `webUrl`, lập kế hoạch đăng

Với `DEWEB_TOKEN_ID` và `DEWEB_CONTAINER` từ bước 3:

```bash
export RPC=https://rpc.xlayer.tech
export ATRO_CPU=$(node -p "require('./deployments/xlayer.json').cpu")
export DEWEB_TOKEN_ID=<n do người dùng gửi>
cast receipt <hash tape-out> --rpc-url $RPC      # kiểm từng hash người dùng gửi: status 1 (success)
cast receipt <hash open> --rpc-url $RPC
npm run deweb:site -- --cpu $ATRO_CPU --token-id $DEWEB_TOKEN_ID
node -e "JSON.parse(require('fs').readFileSync('deployments/deweb.json','utf8'))"
export DEWEB_NAME=$(node -p "require('./deployments/deweb.json').name")
BC=$(node -p "require('./deployments/xlayer.json').builderCode ?? ''")
FACTORY=$(node -p "require('./deployments/xlayer.json').factory")
FACTORY_BLOCK=$(node -p "require('./deployments/xlayer.json').factoryBlock")
npm run deployment:write -- --web-url "$(node -p "require('./deployments/deweb.json').gatewayUrl")" ${BC:+--builder-code "$BC"} --factory "$FACTORY" --factory-block "$FACTORY_BLOCK"
npm run build
npm run site:build -- --target deweb
npm run deweb:publish -- --dry-run
```

Kỳ vọng:

- `deployments/deweb.json` parse được; `chainId` 196, `container` = container người dùng gửi ở bước 3, `name` = `<DEWEB_TOKEN_ID>.2.<cpuIndex>.tape`, `gatewayUrl` = `https://<DEWEB_TOKEN_ID>-2-<cpuIndex>.tapekit.org/`. Kiểm bằng `node`, không bằng Biome: `deployments/` nằm ngoài phạm vi Biome.
- `deployments/xlayer.json` có `webUrl` = `gatewayUrl`; `builderCode` giữ nguyên giá trị cũ (nếu có); `factory` và `factoryBlock` không đổi. `--factory` và `--factory-block` lấy từ chính file đó, vì file broadcast của Plan 1 có thể không còn trong máy.
- `site:build` in `… ready for deweb (web only)` khi chưa có `apps/docs`. Nếu docs có mà chưa sạch thì lệnh dừng; chạy lại với `--no-docs` (docs chỉ trên Pages).
- Dry run in mọi file là `new`, dòng tổng phí và dòng khuyến nghị nạp tiền (ước tính ×3). Claude gửi số OKB này cho người dùng; deployer phải còn đủ số đó trước bước 5.

Điền các ô của bảng ở trên từ `deployments/deweb.json` (id, container, tên, hai URL; URL `-open` là `https://<DEWEB_TOKEN_ID>-2-<cpuIndex>-open.tapekit.org/`) và hash giao dịch tape-out, `open`. Ô giao dịch của tên điền ở bước 6. Rồi:

```bash
git add deployments/deweb.json deployments/xlayer.json packages/sdk/src/deployments/xlayer.ts docs/deployments.md
git commit -m "feat(web): record the DeWEB site identity and point webUrl at the gateway"
```

#### 5. [USER, với CLAUDE] Đăng site

[CLAUDE] lập file lệnh (chỉ đọc chain, không gửi gì):

```bash
npm run deweb:publish -- --emit contracts/deweb-calls/site.json
```

`--emit` ghi file, in keccak256 của file, rồi in hai lệnh để chạy trong `contracts/`. Mỗi file chứa tối đa 1 MB dữ liệu, nên site lớn cho nhiều phần.

[USER], trong terminal của mình, trước khi gõ bất kỳ mật khẩu nào:

1. Chạy lệnh kiểm `show()` mà `--emit` in. Lệnh này không cần khoá, không gửi gì, và in keccak256 cùng một dòng cho mỗi lệnh gọi (đích, tên hàm, đường dẫn):
   ```bash
   cd contracts
   DEWEB_CALLS=deweb-calls/site.json forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url 'https://rpc.xlayer.tech'
   ```
2. So keccak256 đó với keccak256 mà `--emit` đã in. Khác nhau thì dừng.
3. Chạy lệnh broadcast (có `DEWEB_KECCAK`). Nếu file khác file đã kiểm, forge dừng với `HashMismatch` hoặc `NoExpectedHash` và không gửi gì:
   ```bash
   cd contracts
   DEWEB_CALLS=deweb-calls/site.json DEWEB_KECCAK=0x<hash> forge script script/07_DewebPublish.s.sol --rpc-url 'https://rpc.xlayer.tech' --account atropyle-deployer --broadcast --slow
   ```
4. Xoá file phần vừa gửi xong: `rm contracts/deweb-calls/site.json` (từ gốc repo) hoặc `rm deweb-calls/site.json` (trong `contracts/`).

[CLAUDE] chạy `npm run deweb:publish -- --dry-run` ở gốc repo. Kỳ vọng: `Nothing to publish: the chain already has this site.`, hoặc một kế hoạch cho phần kế. Nếu còn phần, chạy lại `--emit` rồi lặp bước kiểm và broadcast cho phần đó. Khi hết gì để đăng, `--emit` tự xoá file đã dùng của cùng container.

Nếu bị ngắt giữa chừng (mạng, hết gas): chạy lại `--emit`. File đã đủ bị bỏ qua, file dở được nối tiếp. Không broadcast lại file phần cũ: nó sẽ cắt một file về các chunk đầu.

#### 6. [USER] Bind tên chính tắc

```bash
export DEWEB_NAME=$(node -p "require('./deployments/deweb.json').name")
export DEWEB_CONTAINER=$(node -p "require('./deployments/deweb.json').container")
cast send 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "bind(string,address,uint256)" "$DEWEB_NAME" $DEWEB_CONTAINER 120 --value 0 --rpc-url https://rpc.xlayer.tech --account atropyle-deployer
```

Kỳ vọng: `status 1 (success)`. Gửi hash cho Claude để điền vào bảng.

#### 7. [CLAUDE] Kiểm chain và gateway (chỉ đọc)

```bash
export RPC=https://rpc.xlayer.tech
export DEWEB_NAME=$(node -p "require('./deployments/deweb.json').name")
export DEWEB_CONTAINER=$(node -p "require('./deployments/deweb.json').container")
cast receipt <hash bind> --rpc-url $RPC
cast call 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "isLive(string,address)(bool)" "$DEWEB_NAME" $DEWEB_CONTAINER --rpc-url $RPC
cast call 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 "fallbackPath(address)(string)" $DEWEB_CONTAINER --rpc-url $RPC
npm run deweb:publish -- --dry-run
curl -s -D - -o /dev/null "$(node -p "require('./deployments/deweb.json').gatewayUrl.replace('.tapekit.org', '-open.tapekit.org')")"
```

Kỳ vọng:

- `isLive` = `true`; `fallbackPath` = `"index.html"`.
- Dry run in `Nothing to publish: the chain already has this site.`
- `curl` in dòng trạng thái `200` cùng các header `x-tape-status: ok`, `x-tape-name: <DEWEB_NAME>`, `x-tape-container: <DEWEB_CONTAINER>`.

Chỉ khi cả ba đúng mới điền hash `bind` vào bảng và đổi các ô "—" còn lại; nếu một mục sai, giữ "—" và báo người dùng. Rồi commit `docs/deployments.md`.

#### 8. [USER] Kiểm trong trình duyệt thật

Mở `gatewayUrl` trong Chrome có OKX Wallet, rồi:

1. Trang chủ hiện, banner "Beta — unaudited" có mặt. Mở `#/proof`, bấm chạy; chờ kết quả.
2. Bấm "Connect wallet": OKX Wallet hiện trong danh sách (extension inject được dưới CSP của site). Nếu không có ví nào, ghi lại thông báo lỗi CSP trong DevTools Console.
3. Mở `/.tape/status` trên cùng host: có badge "100% on-chain", danh sách external và off-chain đều trống.
4. Mở một trang vault (địa chỉ vault thật, ví dụ vault Drill thử trong bảng đầu file): trang đọc được dữ liệu từ chain.
5. Trong DevTools Console chạy `await window.okxwallet.request({ method: 'wallet_getCapabilities', params: [(await window.okxwallet.request({ method: 'eth_requestAccounts' }))[0], ['0xc4']] })` và gửi kết quả cho Claude (câu hỏi mở về EIP-5792 trên chain 196).
6. Mở URL `-open` trong trình duyệt của OKX App trên điện thoại: trang hiện và ví của App kết nối được.

Báo kết quả từng mục cho Claude. Mục 2, 3 hoặc 4 hỏng thì Claude mở issue và sửa trước khi đưa link DeWEB vào README hay bài nộp.

#### 9. Đăng lại khi docs có mặt (sau Plan 6)

Khi `apps/docs` đã có: [CLAUDE] chạy `npm run site:build -- --target deweb`. Nếu báo docs chưa sạch, ghi danh sách lỗi cho Plan 6 và giữ bản web-only. Nếu sạch, làm lại bước 5 (`--emit`, kiểm `show()`, broadcast bằng keystore của người dùng) và bước 7. Không có operator và không có khoá nào để thiết lập.
