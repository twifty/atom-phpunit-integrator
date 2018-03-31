/** @babel */
/* global */

import Path from 'path'

import {removeLeadingChars, offsetRange, offsetPoint} from '../util/php-unit-utils'

const tab = '\t'

/**
 * An encapsulation of how and where to create the test files/classes/methods
 *
 * @todo Allow users to implement their own methods
 */
export default class PhpSkelgenFactory
{
  /**
   * Creates a description of the target class/method based on the source
   *
   * @param  {Object} meta           - A description of the source
   * @param  {String} meta.name      - The short name of the PHP class
   * @param  {String} meta.namespace - The namespace containing the class
   * @param  {String} meta.fqcn      - The combined namespace and class name
   * @param  {String} meta.path      - The full path of the file containing the class
   * @param  {String} [meta.method]  - The name of a method to be tested
   *
   * @return {Object}                - The translated meta
   */
  describeTarget (meta) {
    const {oldName = null, oldPath = null, oldNamespace = null} = meta

    if (!oldName || !oldPath || !oldNamespace) {
      throw new Error('An invalid source was passed to describeTarget', meta)
    }

    meta.name += 'Test'

    // const filename = Path.basename(oldPath)
    const leadingNames = oldNamespace.slice(1).split('\\')
    const trailingNames = []

    let currName = leadingNames.pop()
    let currPath = Path.dirname(oldPath)

    let newPath, newNamespace

    if (oldPath !== currPath) {
      while (Path.basename(currPath) === currName) {
        currPath = Path.dirname(currPath)
        trailingNames.unshift(currName)
        currName = leadingNames.pop()
      }

      if ('src' === Path.basename(currPath)) {
        currPath = Path.dirname(currPath)
        newPath = Path.join(currPath, 'tests', ...trailingNames, meta.name + '.php')
        newNamespace = '\\' + leadingNames.concat(currName, 'Test', trailingNames).join('\\')
      }
    }

    if (!newPath || !newNamespace) {
      return null
    }

    meta.path = newPath
    meta.namespace = newNamespace
    meta.fqcn = newNamespace + '\\' + meta.name

    if (meta.method) {
      const oldMethod = meta.method
      const newMethod = 'test' + oldMethod.charAt(0).toUpperCase() + oldMethod.slice(1)

      meta.method = newMethod
    }

    return meta
  }

  /**
   * Creates the PHP code for the test suite class
   *
   * @param  {Object} source - A description of the source class
   * @param  {Object} target - A description of the target class
   *
   * @return {String|{text: string, cursor: Point=, select: Range=}}
   */
  createTestSuite (source, target) {
    const propName = source.name.charAt(0).toLowerCase() + source.name.slice(1)

    let setup = ''
    switch (target.type) {
      case 'class':
        setup = `new ${source.name}`
        break
      case 'trait':
        setup = `$this->getMockForTrait(${source.name}::class)`
        break
      case 'abstract':
        setup = `$this->getMockForAbstractClass(${source.name}::class)`
        break
    }

    const code = [
      '<?php',
      'declare(strict_types=1);',
      '',
      `namespace ${removeLeadingChars('\\', target.namespace)};`,
      '',
      'use PHPUnit\\Framework\\TestCase;',
      `use ${removeLeadingChars('\\', source.fqcn)};`,
      '',
      `class ${target.name} extends TestCase`,
      '{',
      tab + '/**',
      tab + ` * @var ${source.name}`,
      tab + ' */',
      tab + `protected $${propName};`,
      '',
      tab + 'protected function setUp()',
      tab + '{',
      tab + tab + `$this->${propName} = ${setup};`,
      tab + '}',
      '',
      tab + 'protected function tearDown()',
      tab + '{',
      tab + '}',
      '',
    ]

    const meta = this.createTestCase(source, target)
    var method, cursor, select

    if (meta && meta.text) {
      const ins = code.length - 1
      cursor = offsetPoint([ins, 0], meta.cursor)
      select = offsetRange([[ins, 0], [ins, 0]], meta.select)
      method = meta.text
    } else {
      method = ''
      cursor = [8, 0]
    }

    return {
      text: code.join('\n') + method + '}\n',
      cursor,
      select
    }
  }

  /**
   * Creates the PHP function to add to the main test suite
   *
   * @param  {Object} source - A description of the source method
   * @param  {Object} target - A description of the target method
   *
   * @return {String|{text: string, cursor: Point=, select: Range=}}
   */
  createTestCase (source, target) {
    if (target.method && source.method) {
      const code = [
        '',
        tab + '/**',
        tab + ` * @covers ${removeLeadingChars('\\', source.fqcn)}::${source.method}`,
        tab + ' */',
        tab + `public function ${target.method}()`,
        tab + '{',
        tab + tab + '$this->markTestIncomplete("This test has not yet been written.");',
        tab + '}',
        '',
      ]

      return {
        text: code.join('\n'),
        cursor: [6, 2],
        select: [[6, 2], [6, 67]]
      }
    }

    return ''
  }
}
