# dsh-effort-mascot

[English](README.en.md) | **中文**

[![npm](https://img.shields.io/npm/v/dsh-effort-mascot)](https://www.npmjs.com/package/dsh-effort-mascot)
![DSH 0.2.1-rc.2](https://img.shields.io/badge/DSH-0.2.1--rc.2-blue)
![zero build](https://img.shields.io/badge/zero--build-yes-2ea44f)
![license MIT](https://img.shields.io/badge/license-MIT-yellow)

把 **DeepSeek Harness** 聊天框右下角的「思考推理强度」调节，从一行下拉变成一个**会变脸的滑杆卡片**。功能还是原来那个功能 —— 选 off / low / high / max，只是把这件事做得有意思了一点。

**同一只大肥鱼，四档是一条完整的「吃饭」叙事线**：没吃饭时昏昏欲睡 → 捧着碗扒大白饭 → 吃饱回血、元气满满 → 吃太多，碳水晕了（笑）。卡片配色跟着档位走 —— 灰白 → 蓝 → 紫 → 金色彩环，滑杆按档位填充渐变。落到 Ultra 还会先弹一句「思考强度最大时，可能消耗更多词元」，三秒后渐退（提醒这一档更费 token）。

> **一个需要说清楚的映射**：界面上的 **Ultra 就是 DeepSeek 的 `max` 档**。只是换了个更好记的名字和一套视觉，提交给模型的仍然是 `reasoningEffort: "max"`；其余三档沿用官方原名（Off / Low / High）。

底层没有任何改动：复用官方模型目录与 `session.selectModel`，只是同一个控件的另一种画法。

> **卡片固定深色，不跟随明暗主题。** 这是刻意的：它是一块浮在输入框上的「深色材质」，浅色页面里也保持同一个样子，好让插画和金色高光始终成立。

![四档效果](docs/four-tiers.webp)

从低到高依次滑过，最后落到 Ultra（会先弹一次大字提示）：

![拖动演示](docs/slider-demo.gif)

> 动图为了能在 README 里直接播放被压到了 15fps。想看原速原画质（60fps、带声音）：[下载视频版](docs/slider-demo.mp4)。

**三点特色**

- **四档四种表情** —— 不止换颜色，角色本身也在变：打瞌睡 → 扒饭 → 灵光 → 宕机
- **动效只改颜色** —— 彩环旋转、亮度呼吸、滑杆流光、闪电辉光，全部不做位移，不晃眼
- **安静可用** —— 遵循系统「减少动态效果」，开了就全部静止；Ultra 的大字提示也会跳过

## 安装

```sh
dsh plugin add dsh-effort-mascot
```

装完**重启一次 `dsh web`**（宿主半侧在启动时挂载插画路由），然后刷新页面。

<details>
<summary>或者从源码安装（想改代码/换插画时）</summary>

```sh
git clone https://github.com/LingHXiao/dsh-effort-mascot.git
dsh plugin --profile web add ./dsh-effort-mascot
```

装的是本地链接，改完文件重启即可生效，不用重新发布。

</details>

**确认生效**：聊天框右下角的推理强度控件会变成卡片样式，点开能看到插画和滑杆。如果外观没变，说明插件没有注册成功 —— 先看 `~/.dsh/model-effort.log` 有没有 `inject` 报错，再用 `plugin_manager` 确认 bundle 是启用状态。

## 四档：一条「吃饭」的叙事线

| 档位 | 配色 | 画面 | 在这条叙事里 |
|---|---|---|---|
| **关闭 Off** | 灰白，滑杆不填充 | 眼睛半睁、嘴角挂着口水、头顶飘 `Zzz` | **没吃饭**，昏昏欲睡，脑子里不装事 |
| **轻度 Low** | 亮蓝，填充到 1/3 | 捧着饭碗、腮帮子鼓鼓、闭眼吃得正香 | **开饭了**，一口一口慢慢扒大白饭 |
| **高级 High** | 紫色，填充到 2/3 | 星星眼、食指竖起、头顶亮起灯泡、四周冒小星星 | **吃饱了**，回血完成，元气满满开始动脑 |
| **Ultra**（= DeepSeek 的 `max` 档） | 金色 + `终极` 徽章，滑杆蓝→紫→金 | 漩涡眼、口水滴落、四周一圈晕眩线 | **吃太多**，碳水晕了（笑） |

四档连起来读，是同一只鱼从「饿着不动」到「撑到晕倒」的完整过程 —— 这不是四张互不相干的图，而是一条会被读懂的线。

**Ultra 档的额外表现**：

- 拖动落到该档后，整张卡先变成一行大字 ——「思考强度最大时，可能消耗更多词元」—— 3 秒后渐退，再回到正常卡片（提醒这一档会更费 token）
- 纯颜色类动效：彩环旋转、整卡亮度呼吸、滑杆流光、闪电辉光
- 全部遵循系统的「减少动态效果」设置；开启后大字提示会直接跳过

## 兼容性

| | |
|---|---|
| 实测版本 | DSH `0.2.1-rc.2` |
| 实现方式 | 在 `priority: -1` 上遮蔽官方 `conversation.input.model` 座位 |
| 失效表现 | 若 DSH 改了该座位的契约，插件会**静默不注册** —— 官方控件照常显示，不会把界面弄坏 |
| 影响范围 | 不碰 Host、不碰会话日志、不改变模型实际收到的内容；选择仍走 `session.selectModel` |

## 换插画

图片放在 `assets/<档位 id>.webp`：360×360 透明画布，角色本体高度已归一化，所以四张放在一起看起来一样大。宿主半侧通过 `GET /model-effort/asset/<文件名>` 提供（Client bundle 不能直接 import 图片）。

- **换图**：同名文件覆盖即可 → 刷新页面生效（缓存按文件 mtime + size 自动失效）
- **加一档的图**：放入文件，再在 `client.js` 的 `TIER_IMAGES` 里加一行

仓库内自带的插画是 AI 生成的示例素材，可以随意替换成你自己的图。

## 卸载

```sh
plugin_manager remove_bundle target=dsh-effort-mascot
```

官方控件立即恢复，不留残留。

## 这和已有的 effort-slider 插件有什么区别？

DSH 的推理强度默认是下拉列表，社区里已经有几个插件把它换成了滑条，各自选了一个方向：

| 项目 | 它选择的方向 |
|---|---|
| [HanaAyane/dsh-reasoning-effort](https://github.com/HanaAyane/dsh-reasoning-effort) | 沿用原生模型选择器，在推理等级面板里做连续拖动，用大肥鱼的跑步动效表示强度 |
| [Microqian2th/dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider) | Codex 风格连续滑条，高档位带渐变星尘粒子 |
| [yuhub233/dsh-effort-slider](https://github.com/yuhub233/dsh-effort-slider) | 科幻能量条，最高档之上再加一档 Ultra，以及把任务派给子代理的闪电模式 |
| [2768651338/dsh-effort-slider](https://github.com/2768651338/dsh-effort-slider) | 仿 Claude Code 的滑块 |

本项目不追求连续手感，也没有粒子和子代理联动。它做的是另一件事：**四个档位讲同一个故事** —— 同一只大肥鱼，从没吃饭昏睡，到扒大白饭，到吃饱回血，再到碳水晕倒。

所以在意连续拖动的手感、或者想要粒子与联动 → 上面几个更合适；想一眼看出「现在这档是什么状态」→ 可能是这个。

> 「大肥鱼」和「Ultra」这两个叫法在其他项目里也出现过，本项目只是沿用，不主张独占。

## 已知限制

<details>
<summary>展开（3 条）</summary>

- 触发按钮不走官方的 `conversation.input.model.label` 槽位，所以 `ui-deepseek-model-label-1017` 提供的 `1017` 小徽标在该按钮上不显示。
- 卡片内的模型列表没有搜索（模型少时够用，要完整选择器请用 `/model`）。
- 诊断：渲染异常会写入 `~/.dsh/model-effort.log`。

</details>

## 许可

代码 MIT。插画为 AI 生成的示例素材，不主张著作权。
