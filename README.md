foxes-plugin，基于 [mirai-foxes](https://github.com/FurDevsCN/mirai-foxes) 的插件管理器。

此插件管理器不可和`Bot.on`方法并用。

多文件的情况下，您需要手动指定路径并使用`Dynamic import/require`来导入模块。

若遇到模块无法刷新的情况，您可以**删除 Node.js 模块缓存**。

```typescript
import { PluginManager, Plugin } from 'foxes-plugin'
import { Bot, Message } from 'mirai-foxes'
function generate(plug: Plugin): Plugin {
  console.log('test plugin装载中。')
  plug.on('FriendMessage', async data => {
    await plug.bot.send('friend', {
      qq: data.sender.id,
      message: [new Message.Plain('来点涩图')]
    })
  })
  console.log('test plugin装载完成。')
  return plug
}
;(async () => {
  const bot = new Bot()
  await bot.open({
    httpUrl: 'http://127.0.0.1:8080',
    wsUrl: 'http://127.0.0.1:8080',
    qq: 114514,
    verifyKey: ''
  })
  const pm = new PluginManager(bot)
  pm.install('test', generate(new Plugin(pm)))
})()
```
