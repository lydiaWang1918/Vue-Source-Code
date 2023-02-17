/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.

// 执行baseCompile之前所有的事情，都是为了构造最终的编译配置   
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {

  // 抽象语法树
  const ast = parse(template.trim(), options)

  //标记静态节点
  if (options.optimize !== false) {
    optimize(ast, options)
  }

  //生成渲染函数（及静态渲染函数）
  const code = generate(ast, options)
  console.log(code, 'index code');
  return {
    ast,
    render: code.render, // 渲染函数
    staticRenderFns: code.staticRenderFns // 静态渲染函数数组
  }
})
 