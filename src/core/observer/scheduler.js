/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
// 1、重置 has 缓存对象，has = {}
// 2、waiting = flushing = false，表示刷新队列结束、可以向callbacks数组中放入新的flushSchedulerQueue函数、浏览器开启下一次队列
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */

/**
 * flushSchedulerQueue是watcher 更新队列执行函数，做了什么
  1、升序排列 watcher 更新队列
  2、遍历 watcher 更新队列，然后逐个调用 watcher 更新
  3、watcher 更新队列执行完毕，重置状态
  watcher.id 越大，表示这个 watcher 创建的时间越短，实例是越后面生成的，所有升序排列
  先更新父组件，再更新子组件（因为父组件比子组件先创建）
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  // 标志现在正在刷新队列，开始遍历 watcher 队列，逐个调用 watcher 更新了
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.

  // 升序排列， 可以保证：
  // 1、，建
  // 2、一个组件的用户 watcher 在其渲染 watcher 之前被执行，因为用户 watcher 先于 渲染 watcher 创建
  // 3、如果一个组件在其父组件的 watcher 执行期间被销毁，则它的 watcher 可以被跳过

  // 排序以后在刷新队列期间新进来的 watcher 也会按顺序放入队列的合适位置
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  
  // 这里直接使用了 queue.length，动态计算队列的长度，没有缓存长度，是因为在执行现有 watcher 期间队列中可能会被 push 进新的 watcher
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    // 执行 before 钩子，在使用 vm.$watch 或者 watch 选项时可以通过配置项（options.before）传递
    if (watcher.before) {
      watcher.before()
    }
    // 将缓存的 watcher 清除
    id = watcher.id
    has[id] = null

    // 执行 watcher.run，最终触发更新函数，比如 updateComponent 或者 获取 this.xx（xx 为用户 watch 的第二个参数），当然第二个参数也有可能是一个函数，那就直接执行
    watcher.run()
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 所有watcher 完成更新，重置状态
  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 将 watcher 放入 watcher 队列 queue中
// 并注册 【watcher 更新队列 执行函数 flushSchedulerQueue】进宏微任务
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  // 如果 watcher 已经存在，则跳过，不会重复入队，你同时间调用多次 watcher.update ，其实只有第一次调用有用，后面的都会被过滤掉
  if (has[id] == null) {
    // 缓存 watcher.id，用于判断 watcher 是否已经入队
    has[id] = true
     // flushing为false，当前没有处于刷新队列状态，watcher 直接入队
    if (!flushing) {
      queue.push(watcher)
    } else {
      // 在flushSchedulerQueue执行的时候，设置了 flushing = true，内部把 queue 升序排列了，已经在刷新队列了
      // 中途进来的要按顺序来，从队列末尾开始倒序遍历，其中 index 表示 现在正遍历到第几个 watcher（在 flushSchedulerQueue 中设置），根据当前 watcher.id 找到它大于的 watcher.id 的位置，然后将自己插入到该位置之后的下一个位置
      // 即将当前 watcher 放入已排序的队列中，且队列仍是有序的
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    // 为true表示已经把watcher更新队列执行函数 注册到vue的宏微任务上（或者说存放进callbacks中）
    // 正在等待JS栈为空后，就可以执行更新。直到所有watcher 更新完毕，才重置为 false
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        // 直接刷新调度队列，vue如果改为同步才走这执行，性能大打折扣
        flushSchedulerQueue()
        return
      }

      // nextTick作用：
      // 1、将 回调函数（flushSchedulerQueue） 放入 callbacks 数组（注册 【watcher 更新队列 执行函数】进宏微任务）
      // 2、通过 pending 控制是否向浏览器任务队列中添加 flushCallbacks 函数
      nextTick(flushSchedulerQueue)
    }
  }
}
