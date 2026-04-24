# Codex 鍙锋睜绯荤粺 鈥?椤圭洰璁茶В涓庢晠闅滄帓鏌?

---

## 涓€銆佹暣浣撴灦鏋?

```
                        鈹屸攢鈹€鈹€ 閽夐拤缇?@榫欒櫨
                        鈹?
                        鈻?
              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
              鈹? OpenClaw 榫欒櫨    鈹? 鈫?铏氭嫙鏈?192.168.8.47
              鈹? (v2026.3.8)     鈹?
              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                       鈹?HTTPS
                       鈻?
              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
              鈹? Cloudflare CDN   鈹? 鈫?鍏ㄧ悆鍔犻€?+ DDoS 闃叉姢
              鈹? codexapis.uk     鈹?
              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                       鈹?HTTP/2 闅ч亾锛堝凡绂佺敤QUIC锛岄伩鍏岰lash TUN骞叉壈锛?
                       鈻?
              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
              鈹? cloudflared.exe  鈹? 鈫?浣犵殑鏈満
              鈹? (鍥哄畾闅ч亾)       鈹?
              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                       鈹?
                       鈻?
              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
              鈹?New API 缃戝叧     鈹? 鈫?Docker 瀹瑰櫒 :3001
              鈹?Token缁熻+璺敱   鈹?    缁熶竴鍏ュ彛锛岀簿纭褰曟瘡娆¤皟鐢ㄧ殑Token娑堣€?
              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                      鈹?
                      鈻?
              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
              鈹?Team 鍙锋睜      鈹?
              鈹?:8317          鈹?
              鈹?3 涓?Token     鈹?
              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                      鈹?閫氳繃 Clash 浠ｇ悊
                      鈻?
              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
              鈹?Clash Verge    鈹?
              鈹?:7897 (TUN)    鈹?
              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                      鈹?
                      鈻?
              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
              鈹? OpenAI API    鈹?
              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
```

### 璇锋眰娴佺▼锛堜互閽夐拤涓轰緥锛?

1. 鐢ㄦ埛鍦ㄩ拤閽夌兢 @榫欒櫨 鍙戞秷鎭?
2. 榫欒櫨锛圴M 涓婄殑 OpenClaw锛夋敹鍒版秷鎭?
3. OpenClaw 鍚?`https://api.codexapis.uk/v1` 鍙?API 璇锋眰
4. Cloudflare CDN 鎺ユ敹璇锋眰锛岄€氳繃闅ч亾杞彂鍒颁綘鏈満鐨?cloudflared
5. cloudflared 灏嗚姹傝浆缁?`localhost:3001`锛圢ew API 缃戝叧锛?
6. New API 璁板綍璇锋眰锛岃浆鍙戝埌 `localhost:8317`锛圱eam 鍙锋睜锛?
7. CLIProxyAPI 浠?Token 姹犱腑杞閫変竴涓?Token
8. 閫氳繃 Clash 浠ｇ悊锛?27.0.0.1:7897锛夊悜 OpenAI 鍙戣捣鐪熷疄璇锋眰
9. OpenAI 杩斿洖缁撴灉锛屽師璺繑鍥炲埌閽夐拤锛孨ew API 鍚屾椂璁板綍 Token 娑堣€?

---

## 浜屻€佹牳蹇冪粍浠惰鏄?

### 2.1 CLIProxyAPI锛堝彿姹犳牳蹇冿級

**浣滅敤**锛氱鐞嗗涓?OpenAI Token锛屼互杞鏂瑰紡瀵瑰鎻愪緵缁熶竴鐨?API 鎺ュ彛

| 閰嶇疆椤?| Team 鍙锋睜 |
|--------|----------|
| 绔彛 | 8317 |
| 閰嶇疆鏂囦欢 | config_team.yaml |
| Token 鐩綍 | auths_team/ |
| API Key | team-api-key-1 |
| 绠＄悊闈㈡澘 | localhost:8317/management.html |
| 绠＄悊瀵嗛挜 | team-mgmt-key-2026 |

**鍏抽敭琛屼负**锛?
- 鍚姩鏃惰嚜鍔ㄥ皢 `secret-key` 鏄庢枃鏇挎崲涓?bcrypt 鍝堝笇
- 鎸?`account_id` 鍘婚噸锛岀浉鍚岃处鎴峰彧鍔犺浇涓€涓?Token
- Token 鏂囦欢蹇呴』鏀惧湪 `auth-dir` 鐨?*鏍圭洰褰?*锛屼笉璇诲瓙鐩綍

### 2.2 Cloudflare 鍥哄畾闅ч亾

**浣滅敤**锛氳澶栫綉鑳借闂綘鏈満鐨勫彿姹狅紝鍦板潃姘镐笉鍙?

| 淇℃伅 | 鍊?|
|------|-----|
| 鍩熷悕 | codexapis.uk |
| 闅ч亾鍚?| codex-pool |
| 闅ч亾 ID | 632831ce-c805-4bd1-9239-985590c2aa61 |
| 缁熶竴鍏ュ彛 | https://api.codexapis.uk/v1 鈫?New API (:3001) |
| Team 鐩磋繛鍦板潃 | https://team-api.codexapis.uk/v1 鈫?鍙锋睜 (:8317) |
| 閰嶇疆鏂囦欢 | C:\Users\AWSA\.cloudflared\config.yml |
| 鍑瘉鏂囦欢 | C:\Users\AWSA\.cloudflared\632831ce-...json |

### 2.3 OpenClaw 榫欒櫨

**浣滅敤**锛欰I 鑱婂ぉ缃戝叧锛屾帴鍏ラ拤閽?Telegram锛岃皟鐢ㄥ彿姹?API

| 淇℃伅 | 鍊?|
|------|-----|
| 浣嶇疆 | 铏氭嫙鏈?192.168.8.47 |
| 鐢ㄦ埛 | openclaw |
| 閰嶇疆 | ~/.openclaw/openclaw.json |
| 鏈嶅姟 | openclaw-gateway.service锛坰ystemd user锛?|
| baseUrl | https://api.codexapis.uk/v1 |
| apiKey | REDACTED_SEE_PRIVATE_HANDOFF |

### 2.4 鑷姩鍖栧畧鎶ょ郴缁燂紙鍙屽眰瀹堟姢锛?

绯荤粺閲囩敤 **bat LOOP锛堢绾э級+ health_check锛堝垎閽熺骇锛?* 鍙屽眰瀹堟姢鏋舵瀯锛?

| 瀹堟姢灞?| 缁勪欢 | 鏈哄埗 | 鍝嶅簲閫熷害 |
|--------|------|------|----------|
| 绗竴灞?| start_xxx.bat | LOOP 寰幆锛氳繘绋嬪穿婧冨悗 5-10 绉掕嚜鍔ㄩ噸鍚?| 绉掔骇 |
| 绗簩灞?| health_check.ps1 v2.3 | 瀹氭椂宸℃锛欻TTP杩為€氭€ф娴?+ 鍍靛案杩涚▼娓呯悊 + 妗岄潰寮圭獥鍛婅 | 姣?2 鍒嗛挓 |

**bat LOOP 鍘熺悊**锛氬幓鎺?`pause`锛屾敼涓?`goto LOOP`銆傝繘绋嬫甯歌繍琛屾椂鑴氭湰闃诲鍦?exe 閭ｈ锛涜繘绋嬪穿浜嗭紝鑴氭湰璧板埌 `timeout` 绛夊嚑绉掑悗 `goto LOOP` 閲嶆柊鍚姩銆?

**health_check v2.3 闅ч亾妫€娴嬪崌绾?*锛氫笉鍐嶅彧鐪?cloudflared 杩涚▼鏄惁瀛樺湪锛岃€屾槸鍚屾椂妫€娴嬪叕缃?`https://team-api.codexapis.uk` 鏄惁鍙揪銆傚鏋滆繘绋嬫椿鐫€浣嗛毀閬撲笉閫氾紙TLS EOF / 鍍靛案鐘舵€侊級锛岃繛缁?2 娆℃娴嬪け璐ュ悗鏉€鎺夎繘绋嬶紝鐢?bat LOOP 鑷姩閲嶅惎銆?

**鏃ュ織鏂囦欢**锛?
- `health.log`锛氬仴搴锋鏌ユ棩蹇楋紙鑷姩杞浆锛屾渶澶?00琛岋級
- `restart.log`锛歜at LOOP 閲嶅惎璁板綍锛堣褰曟瘡娆″穿婧冮噸鍚殑鏃堕棿鍜屾湇鍔″悕锛?

---

## 涓夈€佹棩甯告搷浣滄寚鍗?

### 寮€鏈哄悗
姝ｅ父鎯呭喌涓嬶紝寮€鏈鸿嚜鍚换鍔′細鑷姩鍚姩鍙锋睜鍜岄毀閬撱€侱ocker Desktop 浼氳嚜鍔ㄥ惎鍔?New API 瀹瑰櫒銆傚仴搴锋鏌ヨ剼鏈細姣?鍒嗛挓鑷姩妫€娴嬪苟鎷夎捣鎸傛帀鐨勬湇鍔°€傚鏋滈渶瑕佹墜鍔ㄥ惎鍔細
1. 纭 Docker Desktop 宸插惎鍔紙new-api 瀹瑰櫒鑷姩杩愯锛?
2. 鍙屽嚮 `start_all.bat`
3. 鍙屽嚮 `start_tunnel.bat`

### 娣诲姞鏂?Team Token
```
1. 纭繚鍙锋睜宸插惎鍔紙start_team.bat 绐楀彛鍦ㄨ窇锛?
2. 娴忚鍣ㄦ墦寮€ http://localhost:8317/management.html
3. 宸︿晶鑿滃崟鐐瑰嚮 "OAuth 鐧诲綍"
4. 鐐瑰嚮 Codex OAuth 鐨?"鐧诲綍" 鎸夐挳
5. 娴忚鍣ㄧ櫥褰?OpenAI Team 璐﹀彿
6. 鐪嬪埌 "璁よ瘉鎴愬姛!" 鍗冲畬鎴愶紝鍙锋睜鑷姩鐑姞杞?
```

### 鏌ョ湅鏃ュ織
```powershell
# 鍋ュ悍妫€鏌ユ棩蹇?
Get-Content health.log -Tail 20

# 鏈嶅姟宕╂簝閲嶅惎璁板綍
Get-Content restart.log -Tail 20
```

---

## 鍥涖€佹晠闅滄帓鏌?

### 鏁呴殰1锛氶拤閽?@榫欒櫨 娌℃湁鍥炲

**鎺掓煡椤哄簭**锛?

```
1. 鍙锋睜鏄惁鍦ㄨ繍琛岋紵
   鈫?鐪嬩换鍔℃爮鏈夋病鏈?[Team] 鐨勯粦鑹茬獥鍙?
   鈫?娌℃湁 鈫?鍙屽嚮 start_all.bat

2. 闅ч亾鏄惁鍦ㄨ繍琛岋紵
   鈫?鐪嬩换鍔℃爮鏈夋病鏈?[Tunnel] 鐨勭獥鍙?
   鈫?娌℃湁 鈫?鍙屽嚮 start_tunnel.bat

3. 鏈湴娴嬭瘯鍙锋睜鏄惁姝ｅ父锛?
   鈫?娴忚鍣ㄦ墦寮€ http://localhost:8317/v1/models
   鈫?姝ｅ父浼氭樉绀?{"error":"Missing API key"}
   鈫?濡傛灉鎵撲笉寮€ 鈫?鍙锋睜娌″惎鍔?

4. 澶栫綉闅ч亾鏄惁姝ｅ父锛?
   鈫?娴忚鍣ㄦ墦寮€ https://team-api.codexapis.uk/v1/models
   鈫?姝ｅ父浼氭樉绀?{"error":"Missing API key"}
   鈫?濡傛灉鎵撲笉寮€ 鈫?闅ч亾闂

5. 榫欒櫨鏄惁鍦ㄨ繍琛岋紵
   鈫?SSH 鍒?192.168.8.47
   鈫?systemctl --user status openclaw-gateway.service
   鈫?涓嶆槸 active 鈫?systemctl --user restart openclaw-gateway.service

6. Clash 浠ｇ悊鏄惁姝ｅ父锛?
   鈫?妫€鏌?Clash Verge 鏄惁鍦ㄨ繍琛岋紝TUN 妯″紡鏄惁寮€鍚?
```

### 鏁呴殰2锛欳PAMC 绠＄悊闈㈡澘瀵嗙爜蹇樹簡

CLIProxyAPI 鍚姩鏃朵細灏嗛厤缃枃浠朵腑鐨勬槑鏂?`secret-key` 鑷姩鏇挎崲涓?bcrypt 鍝堝笇銆?

**瑙ｅ喅鍔炴硶**锛?
1. 鍏虫帀鍙锋睜绐楀彛
2. 鎵撳紑 config_team.yaml
3. 灏?`secret-key` 鏀瑰洖鏄庢枃锛?
   ```yaml
   secret-key: "team-mgmt-key-2026"
   ```
4. 閲嶅惎鍙锋睜

### 鏁呴殰3锛氬彿姹犳樉绀虹殑 Token 鏁伴噺涓嶅

**鍙兘鍘熷洜**锛?
- Token 鏂囦欢缂哄皯 `"type": "codex"` 瀛楁 鈫?鎵嬪姩娣诲姞
- 澶氫釜 Token 鍏辩敤鍚屼竴涓?`account_id` 鈫?姝ｅ父鍘婚噸琛屼负
- Token 鏂囦欢鏀惧湪瀛愮洰褰曚腑 鈫?绉诲埌 `auths_team/` 鏍圭洰褰?

### 鏁呴殰4锛欳loudflare 闅ч亾杩炰笉涓?/ TLS鎻℃墜澶辫触锛?026-03-31瀹炴垬楠岃瘉锛?

**鍏稿瀷鐜拌薄**锛氶毀閬撴棩蹇楀弽澶嶅嚭鐜颁互涓嬫姤閿欙紙IP涓?98.18.0.x娈碉級锛?
```
WRN Failed to dial a quic connection error="failed to dial to edge with quic: timeout: no recent network activity"
ERR Unable to establish connection with Cloudflare edge error="TLS handshake with edge error: EOF"
ERR Connection terminated error="there are no free edge addresses left to resolve to"
```

**鏍瑰洜**锛欳lash Verge TUN妯″紡鐨凢ake IP锛?98.18.0.0/15娈碉級鍔寔浜哻loudflared鐨凞NS瑙ｆ瀽鍜岀綉缁滄祦閲忋€俙198.18.0.x` 鏄?Clash 杩斿洖鐨勫亣IP锛屼笉鏄湡姝ｇ殑 Cloudflare 杈圭紭鏈嶅姟鍣↖P銆?

**瀹屾暣瑙ｆ硶锛堜袱姝ョ己涓€涓嶅彲锛?*锛?

**姝ラ1锛氬己鍒?cloudflared 鐢?HTTP/2 鏇夸唬 QUIC**
```
鎵撳紑 C:\Users\AWSA\.cloudflared\config.yml
纭鏈夎繖涓€琛岋紙宸查厤缃級锛?
   protocol: http2
```

**姝ラ2锛氬湪 Clash Verge 鎵╁睍鑴氭湰涓粫杩?cloudflared**

浠?`protocol: http2` 涓嶅锛屽洜涓?TUN 妯″紡鐨?Fake IP 浠嶄細鍔寔 HTTP/2 鐨?TLS 杩炴帴銆傞渶瑕佸湪 Clash Verge 涓厤缃€屾墿灞曡剼鏈€嶈 cloudflared 杩涚▼鐩磋繛涓斾笉璧?Fake IP锛?

```
1. 鍙抽敭 Clash Verge 璁㈤槄鍗＄墖 鈫?銆屾墿灞曡剼鏈€?
2. 鏇挎崲涓轰互涓嬪唴瀹癸細
```

```javascript
// Define main function (script entry)
function main(config, profileName) {
  // cloudflared 杩涚▼璧扮洿杩?
  if (!config.rules) config.rules = [];
  config.rules.unshift('PROCESS-NAME,cloudflared.exe,DIRECT');
  // Cloudflare 闅ч亾鍩熷悕涓嶈蛋 Fake IP锛岃繑鍥炵湡瀹?IP
  if (!config.dns) config.dns = {};
  if (!config.dns['fake-ip-filter']) config.dns['fake-ip-filter'] = [];
  config.dns['fake-ip-filter'].push('+.argotunnel.com');
  config.dns['fake-ip-filter'].push('+.cloudflare.com');
  return config;
}
```

```
3. 淇濆瓨 鈫?鍥為椤靛埛鏂伴厤缃?鈫?閲嶅惎闅ч亾
4. 鎴愬姛鏍囧織锛氭棩蹇楁樉绀?Registered tunnel connection锛孖P 涓?198.41.x.x锛堢湡瀹濩F IP锛?
```

> 鈿狅笍 娉ㄦ剰锛氥€屾墿灞曡鍐欓厤缃€嶄腑涓嶈鍐嶅姞 `prepend-rules`锛屼笌鎵╁睍鑴氭湰鍐茬獊銆備繚鎸佸師鏍峰彧鐣欐敞閲婅鍗冲彲銆?

**鍏朵粬鎺掓煡椤?*锛?
```
1. cloudflared 绐楀彛鏄惁鏄剧ず "Registered tunnel connection"锛?
   鈫?娌℃湁 鈫?妫€鏌?Clash 鎵╁睍鑴氭湰鏄惁鐢熸晥

2. 鏃ュ織涓殑 IP 鏄惁浠嶄负 198.18.0.x锛?
   鈫?鏄?鈫?Clash 鎵╁睍鑴氭湰鏈敓鏁堬紝妫€鏌ヨ剼鏈娉?

3. 鍑瘉鏄惁杩囨湡锛?
   鈫?閲嶆柊鎵ц cloudflared tunnel login
```

### 鏁呴殰5锛氬仴搴锋鏌ユ姤閿?/ 寮圭獥鍛婅

鍋ュ悍妫€鏌2.3浼氭娴?涓妭鐐癸紝寮傚父鏃?health_check 鏉€杩涚▼銆乥at LOOP 鑷姩閲嶅惎锛屽悓鏃跺脊鍑?Windows 妗岄潰閫氱煡銆?

```powershell
# 鏌ョ湅鏈€杩戠殑閿欒
Get-Content health.log -Tail 20 | Select-String "ERROR|WARN|ISSUE"

# 鏃ュ織鏍煎紡璇存槑锛?
# OK   (Team:OK | Proxy:OK | NewAPI:OK | Tunnel:OK | CW:0)                鈫?鍏ㄩ儴姝ｅ父
# ISSUE (Team:FAIL(000) | Proxy:OK | Tunnel:ZOMBIE(000) | CW:0)          鈫?鏈夊紓甯?
```

**甯歌鍘熷洜鍙婂鐞?*锛?
| 鏃ュ織鍏抽敭瀛?| 鍘熷洜 | 澶勭悊鏂瑰紡 |
|------------|------|------|
| Team:FAIL | Team鍙锋睜鎸備簡/Clash鏂簡 | 杩炵画2娆″け璐?鈫?health_check鏉€杩涚▼ 鈫?bat LOOP鑷姩閲嶅惎 |
| Proxy:FAIL | Anthropic浠ｇ悊鎸備簡 | 鍚屼笂 |
| Tunnel:DOWN | cloudflared杩涚▼娑堝け | health_check鐩存帴鍚姩杩涚▼ |
| Tunnel:ZOMBIE(xxx) | 杩涚▼娲荤潃浣嗛毀閬撲笉閫氾紙TLS EOF锛?| 杩炵画2娆?鈫?鏉€杩涚▼ 鈫?bat LOOP鑷姩閲嶅惎 |
| NewAPI:FAIL | Docker瀹瑰櫒鎸備簡 | docker restart new-api |
| CW:N(!) | Team鍙锋睜杩炴帴鍗℃ | 鏉€杩涚▼ 鈫?bat LOOP鑷姩閲嶅惎 |
| Clash 浠ｇ悊鏂簡 | 鎵€鏈夎姹傚け璐?| 闇€鎵嬪姩閲嶅惎 Clash Verge |
| Token 鍏ㄩ儴杩囨湡 | 鍙锋睜鏃犲彲鐢ㄨ处鍙?| 闇€鎵嬪姩琛ュ厖鏂?Token |

### 鏁呴殰6锛氬紑鏈鸿嚜鍚病鐢熸晥

```powershell
# 妫€鏌ヤ换鍔＄姸鎬侊紙绠＄悊鍛?PowerShell锛?
Get-ScheduledTask | Where-Object {$_.TaskName -like "CLIProxyAPI*"} | Select-Object TaskName, State

# 鎵嬪姩瑙﹀彂娴嬭瘯
Start-ScheduledTask -TaskName "CLIProxyAPI-StartAll"
```

### 鏁呴殰7锛氱鍙ｈ鍗犵敤锛圗ADDRINUSE锛夛紙2026-03-30瀹炴垬楠岃瘉锛?

**鍏稿瀷鐜拌薄**锛氬惎鍔ㄦ湇鍔℃椂鎶ラ敊 `EADDRINUSE: address already in use 0.0.0.0:绔彛鍙穈

**鏍瑰洜**锛氭棫杩涚▼鏈纭€€鍑猴紝浠嶅崰鐢ㄧ鍙ｏ紙甯歌浜?320 anthropic_proxy銆?000 claude-bridge銆?317鍙锋睜锛?

**瑙ｆ硶**锛?
```
1. 鎵惧埌鍗犵敤绔彛鐨勮繘绋婸ID锛?
   netstat -ano | findstr :8320       锛堟浛鎹负瀹為檯绔彛鍙凤級

2. 鐢ㄧ鐞嗗憳CMD鏉€鎺夛紙鏅€歅owerShell鏉冮檺涓嶈冻鏃堕渶瑕佺鐞嗗憳CMD锛夛細
   taskkill /F /PID <PID鍙?

3. 閲嶆柊鍚姩瀵瑰簲鏈嶅姟
```

> 鈿狅笍 娉ㄦ剰锛氭櫘閫歅owerShell鐨?`Stop-Process` 鍙兘鎶?鎷掔粷璁块棶"锛屽繀椤荤敤**绠＄悊鍛楥MD**鎵ц `taskkill /F /PID`

### 鏁呴殰8锛歜at鏂囦欢鍙屽嚮鍚庡叏鏄贡鐮侊紙2026-03-30瀹炴垬楠岃瘉锛?

**鍏稿瀷鐜拌薄**锛氬弻鍑?`start_all.bat` 鍚庯紝CMD绐楀彛鍏ㄦ槸涔辩爜 + "涓嶆槸鍐呴儴鎴栧閮ㄥ懡浠?

**鏍瑰洜**锛歜at鏂囦欢浠TF-8缂栫爜淇濆瓨锛堝惈涓枃瀛楃锛夛紝浣咰MD榛樿鐢℅BK缂栫爜璇诲彇锛屽瀛楄妭涓枃琚敊璇В鏋愬鑷村懡浠ゆ柇瑁?

**瑙ｆ硶**锛?
```
鏂规硶1锛歜at鏂囦欢寮€澶村姞涓€琛?chcp 65001 >nul 2>&1锛堝垏鎹MD涓篣TF-8妯″紡锛?
鏂规硶2锛氬皢bat鏂囦欢涓殑涓枃鍏ㄩ儴鏇挎崲涓鸿嫳鏂囷紙鏈€淇濋櫓锛?
涓ょ鏂规硶寤鸿鍚屾椂浣跨敤
```

---

## 浜斻€佸畾鏃朵换鍔′竴瑙?

| 浠诲姟鍚?| 鎵ц鍐呭 | 棰戠巼 | 鏉冮檺 |
|--------|---------|------|------|
| CLIProxyAPI-StartAll | start_all.bat | 鐧诲綍鏃?| 鏅€?|
| CLIProxyAPI-Tunnel | start_tunnel.bat | 鐧诲綍鏃?| 鏅€?|
| CLIProxyAPI-HealthCheck | health_check.ps1 | 姣?2 鍒嗛挓 | 鏈€楂?|

---

## 鍏€侀噸瑕佽矾寰勯€熸煡

| 鏂囦欢/鐩綍 | 璺緞 |
|----------|------|
| 椤圭洰鏍圭洰褰?| `C:\Users\AWSA\Desktop\codex鏃犵嚎鍙锋睜\` |
| 鍋ュ悍妫€鏌ユ棩蹇?| `C:\Users\AWSA\Desktop\codex鏃犵嚎鍙锋睜\health.log` |
| 鏈嶅姟閲嶅惎鏃ュ織 | `C:\Users\AWSA\Desktop\codex鏃犵嚎鍙锋睜\restart.log` |
| New API 鏁版嵁 | `C:\Users\AWSA\Desktop\new-api-data\` |
| New API 绠＄悊闈㈡澘 | `http://localhost:3001` (root/12345678) |
| cloudflared 閰嶇疆 | `C:\Users\AWSA\.cloudflared\config.yml` |
| cloudflared 鍑瘉 | `C:\Users\AWSA\.cloudflared\632831ce-...json` |
| cloudflared 璇佷功 | `C:\Users\AWSA\.cloudflared\cert.pem` |
| 榫欒櫨閰嶇疆 | `~/.openclaw/openclaw.json`锛圴M 涓婏級 |
| 榫欒櫨閰嶇疆澶囦唤 | `~/.openclaw/openclaw.json.bak`锛圴M 涓婏級 |


