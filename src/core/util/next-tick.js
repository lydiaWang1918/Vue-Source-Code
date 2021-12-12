/* @flow */
/* globals MutationObserver */

// 空函数，可用作函数占位符
import { noop } from 'shared/util'

// 错误处理函数
import { handleError } from './error'
// 是否是IE、IOS、内置函数
import { isIE, isIOS, isNative } from './env'

// 使用 MicroTask 的标识符，这里是因为火狐在<=53时 无法触发微任务，在modules/events.js文件中引用进行安全排除
export let isUsingMicroTask = false

// 用来存储所有需要执行的回调函数
const callbacks = []
let pending = false

function flushCallbacks () {
  // 复制一遍callbacks、然后把原来的清空，然后再逐个执行callbacks数组中存放的回调函数（用户调用 nextTick 传递的回调函数）
  pending = false

  // 复制一遍的原因是有的回调函数执行过程中又往callbacks中加入，比如 $nextTick的回调函数里还有$nextTick，所以拷贝一份当前的，遍历执行完即可，避免无休止执行下去
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// 将 flushCallbacks 函数放入浏览器的异步任务队列中

let timerFunc // 异步执行函数 用于异步延迟调用 flushCallbacks 函数

// 能力检测和根据能力检测以不同方式执行回调队列优先级Promise > MutationObserver > setImmediate > setTimeout
if (typeof Promise !== 'undefined' && isNative(Promise)) {

  // 首选 Promise.resolve().then()
  const p = Promise.resolve()
  timerFunc = () => {
    // 在 微任务队列 中放入 flushCallbacks 函数
    p.then(flushCallbacks)

    // OS 的UIWebView, Promise.then 回调被推入 microTask 队列，但是队列可能不会如期执行，通过添加空计时器来“强制”刷新微任务队列microTask
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // MutationObserver是HTML5中的API，是一个用于监视DOM变动的接口，它可以监听一个DOM对象上发生的子节点删除、属性修改、文本内容修改等。

  let counter = 1

  // 绑定flushCallbacks回调，得到MO实例，监听到DOM变动后会执行回调flushCallbacks
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true // 设置true 表示观察目标的改变
  })

  // 每次执行timerFunc 都会让文本节点的内容在 0/1之间切换
  // 切换之后将新值复制到 MO 观测的文本节点上
  // 节点内容变化会触发回调

  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {

  // 再就是 setImmediate，它其实已经是一个宏任务了，但仍然比 setTimeout 要好
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.

  // 最后没办法，则使用 setTimeout
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

/**
 * 完成两件事：
 * 1、用 try catch 包装 flushSchedulerQueue 函数，然后将其放入 callbacks 数组
 *    pending 为 false，表示现在浏览器的任务队列中没有 flushCallbacks 函数
 *    如果 pending 为 true，则表示浏览器的任务队列中已经被放入了 flushCallbacks 函数，待执行 flushCallbacks 函数时，pending 会被再次置为 false，表示下一个 flushCallbacks 函数可以进入
 *    pending 的作用：保证在同一时刻，浏览器的任务队列中只有一个 flushCallbacks 函数
 * 2、执行 timerFunc 函数，在浏览器的异步任务队列放入一个刷新 callbacks 数组的函数
 */

 // callbacks 没有直接在 nextTick 中执行回调函数的原因是保证在同一个 tick 内多次执行nextTick，不会开启多个异步任务，而是把这些异步任务都压成一个同步任务，在下一个 tick 执行完毕。vue异步更新队列
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        // ctx上下文
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    // 执行 timerFunc，在浏览器的任务队列中（首选微任务队列）放入 flushCallbacks 函数
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
