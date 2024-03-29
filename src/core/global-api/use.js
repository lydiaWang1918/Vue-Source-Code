/* @flow */

import { toArray } from '../util/index'

// 定义 Vue.use，负责为 Vue 安装插件，做了以下两件事：
// 1、判断插件是否已经被安装，如果安装则直接结束
// 2、安装插件，执行插件的 install 方法
export function initUse (Vue: GlobalAPI) {
  // use方法本质就是执行暴露出来的方法
  Vue.use = function (plugin: Function | Object) {
    // 不会重复注册一个组件
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 将 Vue 构造函数放到第一个参数位置，然后将这些参数传递给 install 方法
    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      // plugin 是一个对象，则执行其 install 方法安装插件
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
       // 执行直接 plugin 方法安装插件
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
