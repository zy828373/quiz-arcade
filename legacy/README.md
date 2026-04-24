# legacy

这个目录用于收拢 `V2` 之前的辅助层、参考层和历史资料。

当前原则：

- 现网核心运行文件仍保留在仓库根目录
- 不破坏 `start_all.bat`、`health_check.ps1`、`start_team.bat` 等现有入口
- 辅助脚本、旧文档、参考源码、工具配置优先归类到这里

当前子目录：

- `helpers/`
  - legacy 辅助脚本正式存放位置
- `docs/`
  - legacy 文档
- `source_ref/`
  - 参考源码/上游目录
- `tooling/`
  - 辅助工具配置

根目录里的 `add_team.ps1`、`convert_auth.ps1`、`disable_sleep.ps1`、`diagnose.bat` 现在是兼容 wrapper。
