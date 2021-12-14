/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  target.$on(event, fn)
}

function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  // 监听实例上的自定义事件，将所有的事件和对应的回调放到vm._events对象上，
  // 将格式：<comp @custom-click="handleClick"></comp> 处理成 vm._event = { eventName: [fn1, ...], ... }
  // this.$on('custom-click', function(){xxx})
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      // event 是有多个事件名组成的数组，则遍历这些事件，依次递归调用 $on
      // this.$on([event1,event2])
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 一个事件可以设置多个响应式函数
      // 如果存在vm._events['custom-click'] = []，this.$on('custom-click', cb1)，this.$on('custom-click', cb2)， vm._events['custom-click'] = [cb1, cb2, ...]
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // <comp @hook:mounted="handleHookMounted"></comp>
      if (hookRE.test(event)) {
        // 置为true，标记当前组件实例存在hook event（提供从外部为组件实例注入声明周期方法的机会）
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // 通过$on添加事件，然后在事件回调函数中先调用$off移除事件（保证只触发一次），再执行用户传进来的回调函数
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    // 将用户传进来的回调函数做一层包装
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    // 将包装函数作为$on的回调函数
    vm.$on(event, on)
    return vm
  }

  // 移除vm._events对象上指定事件{key}的指定回调函数
  // 没有提供参数，则将events对象={}，移除所有事件
  // 提供第一个事件参数，表示移除指定事件，vm.events[key] = null
  // 提供两个参数，表示移除指定事件的指定回调函数
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    if (!arguments.length) {
      // 置为空对象{}，移除所有事件监听
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    // 获取指定事件的回调函数
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // specific handler
    // 移除指定事件的回调函数
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  // 
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        // 提示用户，组件上用小驼峰形式监听事件（@custom-click）
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    
    let cbs = vm._events[event]
    if (cbs) {
      // 类数组转换成数组
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
