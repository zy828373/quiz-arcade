# Claude Code VSCode鎻掍欢鎺ュ叆Codex鍙锋睜 鈥?浜ゆ帴鏂囨。

> **鏃ユ湡**锛?026-03-26
> **鐘舵€?*锛氭湰鏈哄凡閫氾紝杩滅▼鏈嬪弸鎺ュ叆**鏈畬鎴?*锛堝崱鍦ㄦā鍨嬮獙璇侊級

---

## 涓€銆佺郴缁熸灦鏋?
```
Claude Code VSCode鎻掍欢
    鈫?Anthropic API鏍煎紡 (POST /v1/messages)
anthropic_proxy.js (绔彛8320锛岀洃鍚?.0.0.0)
    鈫?杞崲涓篛penAI API鏍煎紡 (POST /v1/chat/completions)
cli-proxy-api.exe (绔彛8317锛孏PT鍙锋睜锛宺ound-robin杞)
    鈫?澶氫釜GPT璐﹀彿Token锛坅uths_team鐩綍锛?```

### 鍏抽敭鏂囦欢

| 鏂囦欢 | 浣滅敤 |
|------|------|
| `anthropic_proxy.js` | Anthropic鈫扥penAI鍗忚杞崲浠ｇ悊锛岀鍙?320 |
| `cli-proxy-api.exe` | GPT鍙锋睜涓荤▼搴忥紝绔彛8317 |
| `config_team.yaml` | 鍙锋睜閰嶇疆锛孉PI Key涓篳team-api-key-1` |

### 浠ｇ悊宸插疄鐜扮殑鍔熻兘

- `POST /v1/messages` 鈥?鎺ユ敹Anthropic鏍煎紡璇锋眰锛岃浆鎹负OpenAI鏍煎紡锛岃浆鍙戝埌8317
- `GET /v1/models` 鈥?杩斿洖鍋囩殑Claude妯″瀷鍒楄〃锛堜粖澶╂柊澧烇級
- `GET /health` 鈥?鍋ュ悍妫€鏌?- 妯″瀷鍚嶅己鍒舵浛鎹负`gpt-5.4`锛堜粖澶╀慨鏀癸紝鍘熸潵鏄€忎紶`body.model`锛?- 鏀寔娴佸紡鍜岄潪娴佸紡鍝嶅簲杞崲
- 璁よ瘉Key锛歚team-api-key-1`

---

## 浜屻€佹湰鏈洪厤缃紙宸叉垚鍔燂級

鏈嶅姟绔疘P锛歚192.168.8.106`

### 2.1 `C:\Users\AWSA\.claude.json`锛堝凡淇敼锛?- `hasCompletedOnboarding: true`锛堝師鏈夛級
- `primaryApiKey: "SEE_PRIVATE"`锛堜粖澶╂柊澧烇級

### 2.2 VSCode `settings.json`锛堝凡淇敼锛?```json
{
  "claudeCode.disableLoginPrompt": true,
  "claude-code.environmentVariables": {
    "ANTHROPIC_BASE_URL": "http://localhost:8320",
    "ANTHROPIC_API_KEY": "team-api-key-1"
  },
  "claudeCode.preferredLocation": "panel",
  "claudeCode.selectedModel": "sonnet[1m]"
}
```

### 2.3 鏈満宸查獙璇侀€氳繃鐨勫姛鑳?- `http://localhost:8320/health` 鈫?200 OK 鉁?- `http://localhost:8320/v1/models` 鈫?杩斿洖妯″瀷鍒楄〃 鉁?- `POST /v1/messages` 鈫?鎴愬姛杞彂骞舵敹鍒癎PT鍝嶅簲 鉁?- Windows闃茬伀澧?320绔彛宸叉斁琛?鉁?
---

## 涓夈€佽繙绋嬫湅鍙嬫帴鍏ワ紙鏈垚鍔燂紝鏍稿績闂锛?
### 3.1 鏈嬪弸宸插畬鎴愮殑閰嶇疆

**鏈嬪弸鐨?`~/.claude.json`**锛氬凡鍔?`hasCompletedOnboarding: true` 鍜?`primaryApiKey: "SEE_PRIVATE"`

**鏈嬪弸鐨?`~/.claude/settings.json`**锛?```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://192.168.8.106:8320",
    "ANTHROPIC_API_KEY": "team-api-key-1"
  }
}
```

**鏈嬪弸鐨?VSCode `settings.json`**锛?```json
{
  "claudeCode.disableLoginPrompt": true,
  "claude-code.environmentVariables": {
    "ANTHROPIC_BASE_URL": "http://192.168.8.106:8320",
    "ANTHROPIC_API_KEY": "team-api-key-1"
  },
  "claudeCode.preferredLocation": "panel",
  "claudeCode.selectedModel": "sonnet[1m]",
  "claudeCode.environmentVariables": []
}
```
> 鈿狅笍 娉ㄦ剰锛氬簳閮ㄦ湁涓€涓┖鐨?`claudeCode.environmentVariables: []`锛屽彲鑳芥湁骞叉壈

### 3.2 缃戠粶杩為€氭€?- 鏈嬪弸鍜屾湇鍔＄鍦?*鍚屼竴灞€鍩熺綉**
- 鏈嬪弸娴忚鍣ㄨ闂?`http://192.168.8.106:8320/health` 鈫?**200 OK** 鉁?- 浣嗕唬鐞嗘棩蹇椾腑**娌℃湁鏀跺埌浠讳綍鏉ヨ嚜鏈嬪弸Claude Code鎻掍欢鐨勮姹?* 鉂?
### 3.3 褰撳墠鎶ラ敊

```
There's an issue with the selected model (claude-sonnet-4-6[1m]). 
It may not exist or you may not have access to it. 
Run --model to pick a different model.
```

鏀规垚 `"selectedModel": "sonnet"` 鍚庢姤閿欏彉涓猴細
```
There's an issue with the selected model (claude-sonnet-4-6). 
It may not exist or you may not have access to it.
```

### 3.4 闂鍒嗘瀽

1. **浠ｇ悊娌℃敹鍒颁换浣曡姹?* 鈫?璇存槑Claude Code鎻掍欢**鍦ㄦ湰鍦板仛妯″瀷楠岃瘉灏卞け璐ヤ簡**锛屾牴鏈病鍙戠綉缁滆姹?2. `sonnet` 鍦ㄥ綋鍓嶇増鏈槧灏勫埌 `claude-sonnet-4-6`锛?*鎻掍欢鍐呴儴涓嶈璇嗚繖涓ā鍨?*锛堝彲鑳芥槸鎻掍欢鐗堟湰宸紓锛?3. 杩欐槸**Claude Code鎻掍欢鐨勫唴閮ㄩ檺鍒?*锛屼笉鏄唬鐞?缃戠粶闂

---

## 鍥涖€佸緟瑙ｅ喅鐨勯棶棰?
### 鏍稿績闂
Claude Code VSCode鎻掍欢鍦ㄥ惎鍔ㄦ椂鍋?*鍐呴儴妯″瀷楠岃瘉**锛堜笉鍙慉PI璇锋眰锛夛紝濡傛灉妯″瀷鍚嶄笉鍦ㄥ叾鍐呴儴鐧藉悕鍗曚腑灏辩洿鎺ユ姤閿欙紝瀵艰嚧鏃犳硶浣跨敤鑷畾涔堿PI銆?
### 鍙兘鐨勮В鍐虫柟鍚?
1. **绯荤粺鐜鍙橀噺鏂瑰紡**锛堟湭楠岃瘉锛?   - 鍦ㄦ湅鍙嬬數鑴戜笂鐢≒owerShell璁剧疆绯荤粺绾х幆澧冨彉閲忥紝缁曡繃VSCode settings锛?   ```powershell
   [System.Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "http://192.168.8.106:8320", "User")
   [System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "team-api-key-1", "User")
   ```

2. **CLI鍏堥€夋ā鍨嬪啀鐢ㄦ彃浠?*锛堟湭楠岃瘉锛?   - 鍦ㄧ粓绔腑杩愯 `claude --model claude-sonnet-4-5-20250514` 閫氳繃CLI鍏堥厤濂芥ā鍨?   - 鐒跺悗VSCode鎻掍欢浼氳鍙朇LI鐨勬ā鍨嬮厤缃?
3. **闄嶄綆鎻掍欢鐗堟湰**锛堟湭楠岃瘉锛?   - 鏈嬪弸鐨勬彃浠剁増鏈彲鑳藉お鏂版垨澶棫锛宍sonnet`鏄犲皠鐨刞claude-sonnet-4-6`涓嶈璇嗗埆
   - 灏濊瘯瀹夎涓庢湇鍔＄鐩稿悓鐗堟湰鐨勬彃浠?
4. **妫€鏌ユ彃浠舵槸鍚︾湡姝ｈ鍙栦簡鐜鍙橀噺**锛堟湭楠岃瘉锛?   - 鏈嬪弸VSCode缁堢涓繍琛?`echo $env:ANTHROPIC_BASE_URL` 纭鍙橀噺鏄惁鐢熸晥
   - 濡傛灉涓虹┖璇存槑 `claude-code.environmentVariables` 娌¤璇诲彇

5. **浣跨敤鍏朵粬鍏煎鎻掍欢**锛堝閫夋柟妗堬級
   - 濡侰line銆丆ontinue绛夛紝鏀寔鑷畾涔塐penAI鍏煎API锛屼笉闇€瑕丄nthropic鏍煎紡
   - 杩欎簺鎻掍欢鍙互鐩存帴杩?`http://192.168.8.106:8317`锛堝彿姹狅紝OpenAI鏍煎紡锛夛紝涓嶉渶瑕佺粡杩嘺nthropic_proxy

6. **鏌ョ湅鏈嬪弸鐨凜laude Code鎻掍欢鐗堟湰鍜孋laude CLI鐗堟湰**
   - 鎻掍欢鐗堟湰锛歏SCode鎵╁睍闈㈡澘鏌ョ湅
   - CLI鐗堟湰锛歚claude --version`
   - 瀵规瘮鏈満鐗堟湰纭鏄惁涓€鑷?
---

## 浜斻€佸凡淇敼鐨勬枃浠舵竻鍗?
| 鏂囦欢 | 淇敼鍐呭 |
|------|---------|
| `anthropic_proxy.js` 绗?8琛?| `body.model \|\| 'gpt-4'` 鈫?`'gpt-5.4'`锛堝己鍒舵ā鍨嬶級 |
| `anthropic_proxy.js` 绗?65琛?| 鏂板 `GET /v1/models` 鎺ュ彛 |
| `C:\Users\AWSA\.claude.json` | 鏂板 `primaryApiKey: "SEE_PRIVATE"` |
| Windows闃茬伀澧?| 鏂板鍏ョ珯瑙勫垯 "Anthropic Proxy 8320" |


