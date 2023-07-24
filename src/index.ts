import { Bot, EventIndex, Processor } from 'mirai-foxes'
import { Event } from 'mirai-foxes'
export class PluginManager {
  /**
   * 插件列表。
   * 由于修改需要配合update使用，故只推荐读取列表，而不推荐直接写或调用插件。
   */
  readonly plugins: Map<string, Plugin> = new Map()
  /**
   * 插件管理器内的对应bot。
   * 插件访问bot时优先使用Plugin.bot。
   */
  readonly bot: Bot
  private regist_types(): Set<Event.EventType> {
    const ret: Set<Event.EventType> = new Set()
    this.plugins.forEach(value => {
      value.type().forEach(value => {
        ret.add(value)
      })
    })
    return ret
  }
  /**
   * 删除所有插件。
   */
  remove(): void
  /**
   * 删除指定名字的插件。
   * @param name 名字。
   * @returns    该插件是否存在。
   */
  remove(name: string): boolean
  remove(name?: string): void | boolean {
    if (name) {
      const v = this.plugins.delete(name)
      if (v) this.update()
      return v
    } else {
      this.plugins.clear()
      this.update()
    }
  }
  /**
   * 更新对应的Bot对象。
   * 一般不推荐使用。
   */
  update(): void {
    this.bot.off()
    const a: Set<Event.EventType> = this.regist_types()
    a.forEach(value =>
      this.bot.on(value, data =>
        this.plugins.forEach(value => value.dispatch(data))
      )
    )
  }
  /**
   * 安装插件。
   * 警告：当安装的插件不属于此插件管理器时，行为未定义。
   * @param name   插件名称。
   * @param plugin 插件内容。
   */
  install(name: string, plugin: Plugin): void {
    this.plugins.set(name, plugin)
    this.update()
  }
  constructor(bot: Bot) {
    this.bot = bot
  }
}
/**
 * 插件。
 * 如果要新建单个插件，需要指定它属于的插件管理器，这意味着，你需要new Plugin(mgr)，并传入插件生成函数，而不让插件访问PluginManager而导致越权写。
 */
export class Plugin {
  private event: Partial<
    Record<Event.EventType, Partial<Processor<Event.EventType>[]>>
  > = {}
  private manager: PluginManager
  private static clone<T>(data: T): T {
    if (typeof data !== 'object' || data == undefined) return data
    const result = Object.create(
      Object.getPrototypeOf(data),
      Object.getOwnPropertyDescriptors(data)
    )
    Reflect.ownKeys(data).forEach(
      key =>
        (result[key] = Plugin.clone(
          (data as Record<string | symbol, unknown>)[key]
        ))
    )
    return result
  }
  /**
   * 获得当前Plugin所属的bot对象，用于不用显式访问插件管理器就访问bot对象。
   * @returns 所属bot对象。
   */
  get bot(): Bot {
    if (!this.manager) throw new Error('Plugin.manager is not initalized')
    return this.manager.bot
  }
  /**
   * 获得插件占用的事件类型。
   * 内部API。不推荐使用。
   * @returns 占用的事件类型。
   */
  type(): Set<Event.EventType> {
    const ret: Set<Event.EventType> = new Set()
    for (const [key, value] of Object.entries(this.event)) {
      if (value && !value.every(val => val == undefined))
        ret.add(key as Event.EventType)
    }
    return ret
  }
  /**
   * 触发一个事件。
   * @param value 事件参数。
   */
  dispatch<T extends Event.EventType>(value: Event.EventArg<T>): void {
    // 如果当前到达的事件拥有处理器，则依次调用所有该事件的处理器
    this.event[value.type]?.forEach(
      (i?: Processor<T>): void => void (i ? i(Plugin.clone(value)) : null)
    )
  }
  /**
   * 添加一个事件处理器
   * 框架维护的 WebSocket 实例会在 ws 的事件 message 下分发 Mirai http server 的消息。
   * @param type     事件类型
   * @param callback 回调函数
   * @returns        事件处理器的标识，用于移除该处理器
   */
  on<T extends Event.EventType>(
    type: T,
    callback: Processor<T>
  ): EventIndex<T> {
    let t = this.event[type]
    if (!t) t = []
    let i = t.indexOf(undefined)
    if (i == -1) {
      t.push(callback as Processor<Event.EventType>)
      i = t.length - 1
    } else {
      t[i] = callback as Processor<Event.EventType>
    }
    this.event[type] = t
    if (this.manager) this.manager.update()
    return new EventIndex<T>({ type, index: i })
  }
  /**
   * 移除全部处理器
   */
  off(): void
  /**
   * 移除type下的所有处理器
   * @param type 事件类型
   */
  off<T extends Event.EventType>(type: T): void
  /**
   * 移除handle指定的事件处理器
   * @param handle 事件处理器标识，由 on 方法返回。
   */
  off<T extends Event.EventType>(handle: EventIndex<T>): void
  /**
   * 移除多个handle指定的事件处理器
   * @param handle 事件处理器标识数组，由多个 on 方法的返回值拼接而成。
   */
  off(handle: EventIndex<Event.EventType>[]): void
  off(
    option?:
      | Event.EventType
      | EventIndex<Event.EventType>
      | EventIndex<Event.EventType>[]
  ): void {
    if (option) {
      if (option instanceof EventIndex) {
        const t = this.event[option.type]
        if (!t) return
        // 从 field eventProcessorMap 中移除 handle 指定的事件处理器
        if (t.length > option.index) t[option.index] = undefined
        this.event[option.type] = t
      } else if (option instanceof Array) {
        // 可迭代
        option.forEach((hd: EventIndex<Event.EventType>) => this.off(hd))
      } else this.event[option] = [] // 只提供type，移除所有
    } else this.event = {}
    if (this.manager) this.manager.update()
  }
  /**
   * 添加一个一次性事件处理器，回调一次后自动移除
   * @param type 事件类型
   * @param callback  回调函数
   * @param strict    是否严格检测调用，由于消息可能会被中间件拦截
   *                  当为 true 时，只有开发者的处理器结束后才会移除该处理器
   *                  当为 false 时，将不等待开发者的处理器，直接移除
   */
  one<T extends Event.EventType>(
    type: T,
    callback: Processor<T>,
    strict = false
  ): void {
    let index: EventIndex<T> = new EventIndex<T>({ type, index: 0 })
    const processor: Processor<T> = async (
      data: Event.EventArg<T>
    ): Promise<void> => {
      strict ? await callback(data) : callback(data)
      this.off(index)
    }
    index = this.on(type, processor)
  }
  constructor(mgr: PluginManager) {
    this.manager = mgr
  }
}
