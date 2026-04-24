# 馃敡 Codex 鍙锋睜 鈥?杩愮淮璇存槑鏂囨。

> **鏈€鍚庢洿鏂?*锛?026-03-24
> **閫傜敤鐜**锛氭湰鍦?Windows 10 Team鍙锋睜 + New API缃戝叧 + Cloudflare Tunnel + 榫欒櫨
> **缁熶竴鍏ュ彛**锛歚https://api.codexapis.uk/v1`
> **API Key**锛歚REDACTED_SEE_PRIVATE_HANDOFF`

---

## 涓€銆佹棩甯歌繍缁撮€熸煡琛?

| 鎴戣鍋氫粈涔?| 鎬庝箞鍋?| 鍦ㄥ摢鍋?|
|-----------|--------|--------|
| 鐪?Token 鐢ㄩ噺缁熻 | 娴忚鍣ㄦ墦寮€ New API 闈㈡澘 | `http://localhost:3001` (root/12345678) |
| 鐪嬪彿姹犳槸涓嶆槸娲荤潃 | 娴忚鍣ㄦ墦寮€ CPAMC 闈㈡澘 | `http://localhost:8317/management.html` |
| 鐪嬪仴搴锋鏌ユ棩蹇?| 鎵撳紑 `health.log` | 椤圭洰鐩綍涓?|
| 鏂板涓€涓?Team 鍙?| 绠＄悊闈㈡澘 OAuth 鐧诲綍 | 瑙佺浜岃妭 |
| 鐢佃剳閲嶅惎鍚庢湇鍔℃病璧锋潵 | 鍙屽嚮 `start_all.bat` + 纭 Docker 鍚姩 | 椤圭洰鐩綍涓?|
| 绌块€忔病璧锋潵 | 鍙屽嚮 `start_tunnel.bat` | 椤圭洰鐩綍涓?|
| 榫欒櫨涓嶅洖娑堟伅浜?| 瑙佺鍥涜妭鏁呴殰鎺掓煡 | 铏氭嫙鏈?192.168.8.47 |

---

## 浜屻€佹柊澧?Team 鍙?

### 浠€涔堟椂鍊欓渶瑕佸仛
- 鏌愪釜 Team 璐﹀彿琚皝/鍒版湡浜?
- 鎯冲姞鏇村 Team 璐﹀彿鎵╁

### 鎿嶄綔姝ラ锛堥€氳繃绠＄悊闈㈡澘 OAuth 鐧诲綍锛?

```
1. 纭繚鍙锋睜宸插惎鍔紙start_team.bat 绐楀彛鍦ㄨ窇锛?

2. 娴忚鍣ㄦ墦寮€绠＄悊闈㈡澘锛歨ttp://localhost:8317/management.html

3. 宸︿晶鑿滃崟鐐瑰嚮 "OAuth 鐧诲綍"

4. 鐐瑰嚮 Codex OAuth 鍖哄煙鐨?"鐧诲綍" 鎸夐挳

5. 娴忚鍣ㄥ脊鍑?OpenAI 鐧诲綍椤碉紝鐧诲綍浣犺娣诲姞鐨?Team 璐﹀彿

6. 鐪嬪埌 "璁よ瘉鎴愬姛!" 鎻愮ず鍗冲畬鎴?

7. 姣忎釜鍙烽噸澶嶆楠?4-6
```

### 鎬庝箞楠岃瘉鍔犳垚鍔熶簡

```
# 鍦ㄧ鐞嗛潰鏉垮乏渚х偣鍑?"璁よ瘉鏂囦欢"
# 搴旂湅鍒版柊娣诲姞鐨勮处鍙凤紝鏍囪涓?Codex 绫诲瀷
# 鍦板潃锛歨ttp://localhost:8317/management.html
```

### 鈿狅笍 娉ㄦ剰浜嬮」
- 鐧诲綍鏃?*蹇呴』**寮规祻瑙堝櫒鎵嬪姩鐧诲綍 OpenAI锛屾病娉曡烦杩?
- 濡傛灉鍚屼竴涓处鍙峰湪澶氫釜 workspace锛屽彧鏈変竴涓細鐢熸晥锛圕LIProxyAPI 鎸?account_id 鍘婚噸锛?
- **涓嶈鎵嬪姩澶嶅埗 `codex login` 鐢熸垚鐨勬枃浠跺埌 auths_team/**锛屾牸寮忎笉鍏煎锛屽繀椤婚€氳繃绠＄悊闈㈡澘 OAuth 鐧诲綍

---

## 涓夈€佸畾鏈熺淮鎶ゆ竻鍗?

### 姣忓ぉ鑷姩鎵ц锛堜笉鐢ㄧ锛?
| 浠诲姟 | 鏃堕棿 | 璇存槑 |
|------|------|------|
| 鍏ㄩ摼璺仴搴锋鏌?| 姣?2 鍒嗛挓 | 妫€娴?Team鍙锋睜銆佽矾鐢变唬鐞嗐€侀毀閬撱€丆LOSE_WAIT锛屽紓甯歌嚜鍔ㄤ慨澶?妗岄潰寮圭獥鍛婅 |

### 姣忓懆寤鸿浜哄伐妫€鏌ヤ竴娆?
| 妫€鏌ラ」 | 鎬庝箞鏌?|
|--------|--------|
| Team Token 鏈夋晥鏁?| CPAMC 闈㈡澘 `localhost:8317/management.html` |
| 鍋ュ悍妫€鏌ユ棩蹇?| 鐪?`health.log`锛屾瘡琛屾牸寮忥細`OK (Team:OK \| Router:OK \| Tunnel:OK \| CW:0)`锛屽叧娉?WARN/ERROR/ISSUE |
| Cloudflare 闅ч亾 | 浠庢墜鏈鸿闂?`https://api.codexapis.uk/health`锛屽簲杩斿洖 OK |
| 鍩熷悕鍒版湡 | codexapis.uk 鍒版湡 2027-03-19锛屽凡寮€鑷姩缁垂 |

### 姣忔湀寤鸿鍋氫竴娆?
| 鎿嶄綔 | 璇存槑 |
|------|------|
| 妫€鏌?Team Token 鍒版湡鏃堕棿 | 鎵撳紑鍚?`teamX_auth.json`锛岀湅 `expired` 瀛楁 |

---

## 鍥涖€佹晠闅滄帓鏌?

### 4.1 鍙锋睜娌″弽搴旓紙curl 瓒呮椂 / CPAMC 鎵撲笉寮€锛?

```
妫€鏌ラ『搴忥細
1. Clash Verge 寮€鐫€娌★紵 鈫?鐪嬩换鍔℃爮鏈夋病鏈夊浘鏍?
2. cli-proxy-api 杩涚▼鍦ㄤ笉鍦紵 鈫?浠诲姟绠＄悊鍣ㄦ悳 "cli-proxy-api"
3. 绔彛琚崰浜嗭紵 鈫?PowerShell: netstat -ano | findstr "8317"
4. 閲嶅惎鍙锋睜 鈫?鍙屽嚮 start_all.bat
```

### 4.2 澶栫綉璁块棶 502 / 鎵撲笉寮€

```
妫€鏌ラ『搴忥細
1. cloudflared 杩涚▼鍦ㄤ笉鍦紵 鈫?浠诲姟绠＄悊鍣ㄦ悳 "cloudflared"
2. 闅ч亾娌″惎鍔?鈫?鍙屽嚮 start_tunnel.bat
3. New API 瀹瑰櫒鍦ㄨ窇娌★紵 鈫?Docker Desktop 鐪?new-api 瀹瑰櫒鐘舵€?
   api.codexapis.uk 鐜板湪鎸囧悜 New API (:3001)锛屼笉鍐嶆槸鏃х殑 model_router
4. 杩樻槸涓嶈 鈫?妫€鏌?C:\Users\AWSA\.cloudflared\config.yml 鏄惁姝ｇ‘
```

### 4.3 榫欒櫨涓嶅洖娑堟伅

```
妫€鏌ラ『搴忥細
1. 铏氭嫙鏈?192.168.8.47 寮€鐫€娌★紵 鈫?杩滅▼妗岄潰杩炰竴涓?
2. WSL 閲?OpenClaw 鍦ㄨ窇娌★紵
   ssh openclaw@192.168.8.47
   systemctl --user status openclaw-gateway.service
3. 濡傛灉鎸備簡 鈫?systemctl --user restart openclaw-gateway.service
4. 濡傛灉鍙锋睜鍦板潃鍙樹簡 鈫?鏀?~/.openclaw/openclaw.json 閲岀殑 baseUrl
```

### 4.4 Team 鍙疯灏?/ 闄愰€?

```
鐜拌薄锛氳皟鐢?gpt-5.4 杩斿洖 403 鎴?500
澶勭悊锛?
1. 鎵撳紑 CPAMC 闈㈡澘鐪嬪摢涓?Token 鎶ラ敊
2. 濡傛灉鏄复鏃堕檺閫?鈫?绛?1-2 灏忔椂锛孋LIProxyAPI 浼氳嚜鍔ㄨ疆鍒颁笅涓€涓?
3. 濡傛灉鏄案涔呭皝鍙?鈫?閫氳繃绠＄悊闈㈡澘 OAuth 鐧诲綍娣诲姞鏂板彿鏇挎崲锛堣绗簩鑺傦級
4. 鍒犻櫎琚皝璐﹀彿鐨?json 鏂囦欢 鈫?浠?auths_team/ 绉婚櫎
```

### 4.5 鐢佃剳閲嶅惎鍚庝竴鍒囬兘娌′簡

```
姝ｅ父鎯呭喌涓嬭鍒掍换鍔′細鑷姩鍚姩锛屽鏋滄病鏈夛細
1. 鎵撳紑 Docker Desktop    鈫?纭 new-api 瀹瑰櫒鍦ㄨ窇锛堣嚜甯?restart always锛?
2. 鍙屽嚮 start_all.bat      鈫?鍚姩 Team 鍙锋睜
3. 鍙屽嚮 start_tunnel.bat   鈫?鍚姩 Cloudflare 绌块€?
4. 閮藉惎鍔ㄥ悗锛岀瓑 30 绉掓祴璇曪細
   curl https://api.codexapis.uk/v1/models -H "Authorization: Bearer REDACTED_SEE_PRIVATE_HANDOFF"
```

### 4.6 绔彛琚崰鐢紙EADDRINUSE锛?

```
鐜拌薄锛氬惎鍔ㄦ湇鍔℃姤閿?"EADDRINUSE: address already in use 0.0.0.0:绔彛鍙?
鍘熷洜锛氭棫杩涚▼娌￠€€鍑猴紝浠嶅崰鐢ㄧ鍙ｏ紙甯歌绔彛锛?320/8000/8317锛?
澶勭悊锛?
1. 绠＄悊鍛楥MD鎵ц锛歯etstat -ano | findstr :绔彛鍙?
2. 鎵惧埌LISTENING閭ｈ鏈€鍙宠竟鐨凱ID
3. 绠＄悊鍛楥MD鎵ц锛歵askkill /F /PID <PID鍙?
4. 閲嶆柊鍚姩瀵瑰簲鏈嶅姟
娉ㄦ剰锛氭櫘閫歅owerShell鐨凷top-Process鍙兘鎶?鎷掔粷璁块棶"锛屽繀椤荤敤绠＄悊鍛楥MD
```

### 4.7 bat鏂囦欢鍙屽嚮鍚庡叏鏄贡鐮?

```
鐜拌薄锛氬弻鍑籦at鍚嶤MD绐楀彛鍏ㄦ槸涔辩爜 + "涓嶆槸鍐呴儴鎴栧閮ㄥ懡浠?
鍘熷洜锛歜at鏂囦欢鏄疷TF-8缂栫爜锛堝惈涓枃锛夛紝CMD榛樿鐢℅BK璇诲彇瀵艰嚧鍛戒护鏂
澶勭悊锛?
1. bat鏂囦欢寮€澶村姞涓€琛岋細chcp 65001 >nul 2>&1
2. 灏哹at鏂囦欢涓殑涓枃鏇挎崲涓鸿嫳鏂囷紙鏈€淇濋櫓锛?
宸蹭慨澶嶇殑鏂囦欢锛歴tart_all.bat, start_team.bat, start_anthropic_proxy.bat, start_tunnel.bat
```

---

## 浜斻€佸叧閿枃浠?鏈嶅姟娓呭崟

| 鏂囦欢/鏈嶅姟 | 浣滅敤 | 鏀瑰姩棰戠巼 |
|------|------|---------|
| **New API (Docker)** | API缃戝叧锛孴oken鐢ㄩ噺缁熻锛岀鍙?001 | Docker瀹瑰櫒锛宺estart always |
| `config_team.yaml` | Team 鍙锋睜閰嶇疆 | 鍑犱箮涓嶆敼 |
| `auths_team/*.json` | Team Token 鏂囦欢 | 鏂板/鏇挎崲鏃舵敼 |
| `health.log` | 鍋ュ悍妫€鏌ユ棩蹇?| 鑷姩鐢熸垚锛岃嚜鍔ㄨ疆杞?00琛?|
| `health_fail_count.tmp` | 杩炵画澶辫触璁℃暟锛堝仴搴锋鏌ュ唴閮ㄧ敤锛?| 鑷姩鐢熸垚锛屽嬁鎵嬪姩缂栬緫 |
| `start_all.bat` | 涓€閿惎鍔ㄥ彿姹?| 涓嶆敼 |
| `start_tunnel.bat` | 鍚姩绌块€?| 涓嶆敼 |
| `add_team.ps1` | 鏂板 Team 鍙疯剼鏈?| 涓嶆敼 |
| `health_check.ps1` | 鍏ㄩ摼璺仴搴锋鏌2.1锛堝惈BurntToast寮圭獥鍛婅锛?| 2026-03-24鍗囩骇 |
| `convert_auth.ps1` | Token 鏍煎紡杞崲 | 涓嶆敼 |

> **宸插簾寮?*锛歚model_router.js`銆乣router_config.json`銆乣start_router.bat` 鈥?鍔熻兘宸茬敱 New API 鏇夸唬


