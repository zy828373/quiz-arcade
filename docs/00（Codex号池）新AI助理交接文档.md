# 馃 Codex 鍙锋睜绯荤粺 鈥?AI 涓婁笅鏂囦氦鎺ユ枃妗?

> **鍒涘缓鏃ユ湡**锛?026-03-25  
> **鏈€鍚庢洿鏂?*锛?026-03-25 16:30  
> **鐢ㄩ€?*锛氬綋涓讳汉鍒囨崲鏂扮殑 AI 璐﹀彿/瀵硅瘽鏃讹紝璇风涓€鏃堕棿闃呰鏈枃妗ｄ互鎺ョ瀹屾暣涓婁笅鏂囦俊鎭€? 
> **鎬庝箞鐢?*锛氭柊瀵硅瘽閲屽彂涓€鍙ャ€岃鍏堣鍙?`C:\Users\AWSA\Desktop\codex鏃犵嚎鍙锋睜\docs\00锛圕odex鍙锋睜锛夋柊AI鍔╃悊浜ゆ帴鏂囨。.md`锛屼簡瑙ｅ叏閮ㄤ笂涓嬫枃鍚庤窡鎴戠‘璁ゃ€?

---

## 涓€銆侀」鐩畾浣嶄笌鐜

| 椤圭洰 | 璇存槑 |
|---|---|
| **宸ヤ綔鐩綍** | `C:\Users\AWSA\Desktop\codex鏃犵嚎鍙锋睜` |
| **what** | 鍩轰簬 CLIProxyAPI 鎼缓鐨勬湰鍦?OpenAI 鍏煎鍙锋睜锛岀鐞嗚嫢骞茬湡瀹?OpenAI/Codex 璐︽埛锛圱eam 姹狅級锛岄€氳繃 Cloudflare Tunnel 鏆撮湶鍒板叕缃戯紝渚涢緳铏?OpenClaw銆丆ursor銆丆laude Code 绛夊閮ㄧ郴缁熻皟鐢?|
| **OS** | Windows 10锛?脳24 灏忔椂寮€鏈?|
| **缈诲** | Clash Verge锛孲OCKS/HTTP 绔彛 `7897` |
| **Docker** | Docker Desktop锛屽紑鏈鸿嚜鍚紝杩愯 New API 瀹瑰櫒 |

---

## 浜屻€佹渶鏂扮郴缁熸灦鏋?(2026-03-24 纭珛)

**鍘熸灦鏋?*宸插簾寮冿細~~model_router.js (绔彛 8319)~~ 鈫?宸插垹闄? 
**鐜版灦鏋?*濡備笅锛?

```
[澶栭儴璇锋眰鏂筣 (榫欒櫨銆丆ursor銆丆laude Code 绛?
   鈹?
   鈹? https://api.codexapis.uk/v1 + sk- 浠ょ墝
   鈻?
[Cloudflare Tunnel]  鈹€鈹€鈹€ 鍥哄畾闅ч亾锛屽煙鍚?api.codexapis.uk 鈫?鏈満 :3001
   鈻?
[1] New API 缃戝叧 (Docker 瀹瑰櫒 "new-api", :3001)
   鈹? 鉁?楠岃瘉 sk- 浠ょ墝韬唤
   鈹? 鉁?鎸夌敤鎴疯褰?Token 娑堣€?
   鈹? 鉁?鎵ｉ櫎鐢ㄦ埛铏氭嫙棰濆害
   鈹? 杞彂缁欎笅绾ф笭閬?鈫?localhost:8317
   鈻?
[2] Team 鍙锋睜 (cli-proxy-api.exe, :8317)
   鈹? 浠?auths_team/ 鐩綍涓?3 涓瓨娲荤殑 OpenAI 璐﹀彿涓疆璇?
   鈹? 閫氳繃 Clash(:7897) 鍑烘捣
   鈻?
[3] OpenAI 瀹樻柟 API
```

---

## 涓夈€佹牳蹇冭祫浜ч€熸煡琛?鈿狅笍 鏋佸叾閲嶈

### 3.1 鍦板潃涓庡瘑閽?

| 缁勪欢 | 鍦板潃 | 璁よ瘉淇℃伅 |
|---|---|---|
| **澶栫綉缁熶竴鍏ュ彛** | `https://api.codexapis.uk/v1` | 瑙佷笅鏂逛护鐗岃〃 |
| **New API 绠＄悊闈㈡澘** | `http://localhost:3001` | 璐﹀彿 `root` / 瀵嗙爜 `12345678` |
| **Team 鍙锋睜绠＄悊闈㈡澘** | `http://localhost:8317/management.html` | 閫氳繃 OAuth 鐧诲綍 |

### 3.2 New API 浠ょ墝鍒楄〃

| 浠ょ墝鍚?| 鎵€灞炵敤鎴?| Key | 鐢ㄩ€?| 棰濆害 |
|---|---|---|---|---|
| `unified-key` | root | `REDACTED_SEE_PRIVATE_HANDOFF` | **涓讳护鐗?*锛岃嚜鐢?鍒嗕韩缁欓緳铏?| $200 |
| `缁欓緳铏剧殑` | openclaw-user1 | `REDACTED_SEE_PRIVATE_HANDOFF` | 鍘熻鍒掔粰榫欒櫨鍗曠嫭璁¤垂鐢紝浣嗗洜棰濆害涓?瀵艰嚧403锛?*宸插純鐢?*锛岀洰鍓嶆敼涓虹洿鎺ョ敤 root 鐨?unified-key | $0.01 |

### 3.3 Team 鍙锋睜瀛樻椿璐﹀彿 (鎴嚦 2026-03-25)

鍙锋睜鍔犺浇浜?`auths_team/` 涓嬬殑 3 涓?JSON 鏂囦欢锛?
1. `codex-1ca64f7d-jucoaxrhppkp@outlook.com-team.json`
2. `codex-1d3846fc-zhangyangzhang922@gmail.com-team.json`
3. `codex-8a45d992-victoriaozer437@gmail.com-team.json`

鏀寔鐨勬ā鍨嬶細`gpt-5`銆乣gpt-5.4`銆乣gpt-5.4-mini` 绛夊叡 12 涓€?

### 3.4 鍙敤妯″瀷 (瀵瑰鏆撮湶)

鍦?New API 涓厤缃殑瀵瑰鍙敤妯″瀷锛歚gpt-5.4`銆乣gpt-5.4-mini`

---

## 鍥涖€佹枃浠剁洰褰曠粨鏋?

```
codex鏃犵嚎鍙锋睜/
鈹溾攢鈹€ docs/                                    鈫?銆愭墍鏈夊綋鍓嶆枃妗ｃ€?
鈹?  鈹溾攢鈹€ 00锛圕odex鍙锋睜锛夋柊AI鍔╃悊浜ゆ帴鏂囨。.md    鈫?鏈枃浠?
鈹?  鈹溾攢鈹€ 01锛圕odex鍙锋睜锛夌郴缁熸杩?md            鈫?澶х櫧璇濅粙缁嶆暣涓郴缁?
鈹?  鈹溾攢鈹€ 02锛圕odex鍙锋睜锛夎繍缁存墜鍐?md            鈫?鏃ュ父鎿嶄綔+鏁呴殰鎺掓煡锛堥噸鍚彿姹犵湅杩欎釜锛?
鈹?  鈹溾攢鈹€ 03锛圕odex鍙锋睜锛夋灦鏋勪笌鏁呴殰鎺掓煡.md      鈫?娣卞害鎶€鏈枃妗?
鈹?  鈹斺攢鈹€ 04锛圕odex鍙锋睜锛堿I鎻愮ず璇嶆寚鍗?md        鈫?鏁欎富浜烘€庝箞缁橝I鍠傛枃妗?
鈹?
鈹溾攢鈹€ _archive/                                鈫?銆愬巻鍙插綊妗ｏ紝宸茶繃鏃朵笉鍐嶇淮鎶ゃ€?
鈹?  鈹溾攢鈹€ 瀹炴柦瀹屾垚鎶ュ憡_2026-03-20.md
鈹?  鈹溾攢鈹€ 鎿嶄綔璁板綍_2026-03-20.md
鈹?  鈹斺攢鈹€ 鏈湴杩佺Щ鎿嶄綔鎸囧崡_V2.md
鈹?
鈹溾攢鈹€ _free_backup/                            鈫?Free 姹犲浠斤紙褰撳墠鏈惎鐢級
鈹溾攢鈹€ auths_team/                              鈫?Team 姹犵殑 3 涓?Token JSON 鏂囦欢
鈹溾攢鈹€ cli-proxy-api.exe                        鈫?鍙锋睜涓荤▼搴?
鈹溾攢鈹€ config_team.yaml                         鈫?Team 鍙锋睜閰嶇疆
鈹溾攢鈹€ start_all.bat                            鈫?涓€閿惎鍔ㄥ彿姹?
鈹溾攢鈹€ start_team.bat                           鈫?鍗曠嫭鍚姩 Team 鍙锋睜
鈹溾攢鈹€ start_tunnel.bat                         鈫?鍚姩 Cloudflare 闅ч亾
鈹溾攢鈹€ health_check.ps1                         鈫?鍋ュ悍妫€鏌ヨ剼鏈?v2.2
鈹斺攢鈹€ cloudflared.exe                          鈫?Cloudflare 闅ч亾绋嬪簭
```

---

## 浜斻€佽繎鏈熸搷浣滃巻鍙?(鎸夋椂闂村€掑簭)

### 2026-03-25 涓嬪崍锛氶緳铏?OpenClaw)鎺ュ叆鍙锋睜

- **鐩爣**锛氳鍒汉鐨勯緳铏?(OpenClaw) 閫氳繃澶栫綉璋冪敤鎴戜滑鐨?Team 鍙锋睜
- **缁欏鏂圭殑閰嶇疆**锛?
  - API Base URL: `https://api.codexapis.uk/v1`
  - API Key: `REDACTED_SEE_PRIVATE_HANDOFF`锛坮oot 鐨?unified-key锛?
  - Model: `gpt-5.4`
  - Endpoint compatibility: `OpenAI-compatible`
- **韪╄繃鐨勫潙**锛?
  - 鏈€鍒濆皾璇曠粰瀵规柟鍗曠嫭寤?`openclaw-user1` 璐﹀彿 + 涓撳睘浠ょ墝锛坄sk-dO2A...`锛夛紝浣嗗洜涓鸿鐢ㄦ埛浣欓鍑犱箮涓?锛?0.01锛夛紝瀵艰嚧 New API 杩斿洖 **403 Forbidden**
  - **鏈€缁堟柟妗?*锛氱洿鎺ヤ娇鐢?root 鐨?`unified-key`锛?200 棰濆害锛夛紝涓€姝ュ埌浣?
- **瀵规柟鐨勯緳铏鹃厤缃柟寮?*锛氬鏂瑰湪杩愯 `openclaw onboard` 鏃讹紝鍦ㄤ氦浜掑紡鐣岄潰涓€夋嫨 `Custom Provider` 鈫?`OpenAI-compatible`锛屽～鍏ヤ笂杩?URL 鍜?Key 鍗冲彲

### 2026-03-25 涓婂崍锛氭枃妗ｉ噸缁?

- 灏?6 涓暎钀界殑 .md 鏂囦欢鏁寸悊涓?`docs/`锛?涓椿璺冩枃妗ｏ級鍜?`_archive/`锛?涓繃鏃舵枃妗ｏ級
- 鏂囦欢鍚嶅姞涓婇」鐩爣璇?`锛圕odex鍙锋睜锛塦 鍜岀紪鍙峰墠缂€

### 2026-03-25 涓婂崍锛歍eam 鍙锋睜閲嶅惎鎺掗敊

- 鍙锋睜鍚姩鎶ラ敊 `bind: Only one usage of each socket address` 鈫?鍘熷洜鏄棫杩涚▼娌″叧灏卞惎鍔ㄤ簡鏂扮殑
- 瑙ｅ喅鏂规硶锛氬厛 `Stop-Process` 鏉€鎺夋棫鐨?`cli-proxy-api`锛屽啀閲嶆柊鍚姩
- 閲嶅惎鍚?3 涓处鍙峰叏閮ㄥ姞杞芥垚鍔燂紝12 涓ā鍨嬫敞鍐屽畬姣?

### 2026-03-24锛歂ew API 閮ㄧ讲 + 鏋舵瀯閲嶆瀯

- 閮ㄧ讲 New API Docker 瀹瑰櫒锛坈alciumion/new-api:latest锛岀鍙?3001锛?
- 搴熷純 model_router.js锛屽皢璺敱閫昏緫鍏ㄩ儴浜ょ粰 New API
- 鏇存柊 Cloudflare Tunnel 閰嶇疆锛屾祦閲忕洰鏍囦粠 :8319 鏀逛负 :3001
- 鍗囩骇 health_check.ps1 鍒?v2.2锛岀洃鎺х洰鏍囨敼涓?New API + Team 鍙锋睜
- 鍦?New API 涓厤缃笭閬?`TeamPool-8317`锛屽垱寤轰护鐗?`unified-key`
- 鏇存柊鎵€鏈夋枃妗ｏ紙杩愮淮鎵嬪唽銆佺郴缁熻В閲娿€佹灦鏋勬枃妗ｏ級

---

## 鍏€佽繍缁撮€熻

### 6.1 閲嶅惎鍙锋睜锛堟渶甯哥敤锛?

```powershell
# 1. 鏉€鏃ц繘绋?
Get-Process -Name "cli-proxy-api" | Stop-Process -Force
# 2. 鍙屽嚮 start_team.bat锛堟垨鍦ㄩ」鐩洰褰曚笅杩愯锛?
```

### 6.2 閲嶅惎椤哄簭锛堢數鑴戦噸鍚悗锛?

```
1. Docker Desktop锛堢瓑瀹冨畬鍏ㄥ惎鍔紝new-api 瀹瑰櫒鑷姩鎷夎捣锛?
2. 鍙屽嚮 start_all.bat锛堝惎鍔?Team 鍙锋睜锛?
3. 鍙屽嚮 start_tunnel.bat锛堝惎鍔ㄧ┛閫忛毀閬擄級
```

### 6.3 鏍稿績鍘熷垯

- **璋佹寕浜嗛噸鍚皝**锛屼笉闇€瑕佽繛甯﹂噸鍚叾浠栫粍浠?
- 鍞竴渚嬪锛氱數鑴戦噸鍚悗闇€瑕佹寜涓婅堪椤哄簭鍏ㄩ儴鍚姩

---

## 涓冦€佺粰涓嬩竴浠?AI 鐨勬敞鎰忎簨椤?

1. **涓嶈**鍐嶅幓淇敼鎴栧鎵?`model_router.js`锛屽畠宸茬粡琚簾寮冧簡
2. 浠讳綍涓?*璁¤垂銆佺粺璁＄敤閲忋€佸垎鍙?API Key**鏈夊叧鐨勯渶姹?鈫?鍘?New API 闈㈡澘 `localhost:3001`
3. 浠讳綍涓?*鏂板鐪熷疄 OpenAI 璐﹀彿銆佽处鍙峰瓨娲绘鏌?*鏈夊叧鐨勯渶姹?鈫?鍘诲彿姹犻潰鏉?`localhost:8317/management.html`
4. 缃戠粶涓嶉€?鈫?鍏堟鏌?Clash(7897) 鍜?Docker 瀹瑰櫒鐘舵€?
5. 涓嶈缁?`openclaw-user1` 璐﹀彿鍙戜护鐗屼簡锛堥搴﹀お灏戜細 403锛夛紝**鐩存帴鐢?root 鐨?unified-key**


