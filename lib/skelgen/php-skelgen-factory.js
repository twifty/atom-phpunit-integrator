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
	 * The given object is a clone and safe to modify and return.
	 *
	 * @param  {PhpUnitScope} meta - A description of the source
	 *
	 * @return {PhpUnitScope}      - The translated scope
	 */
	describeTarget (scope) {
		if (scope.isTestFile()) {
			throw new Error('An invalid source was passed to describeTarget')
		}

		const oldName = scope.getShortClassName()
		const oldNamespace = scope.getNamespace()
		const oldPath = scope.getPath()
		const oldMethodName = scope.getMethodName()

		const newName = oldName + 'Test'
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
				newPath = Path.join(currPath, 'tests', ...trailingNames, newName + '.php')
				newNamespace = '\\' + leadingNames.concat(currName, 'Test', trailingNames).join('\\')
			}
		}

		if (!newPath || !newNamespace) {
			return null
		}

		var method
		if (oldMethodName) {
			method = 'test' + oldMethodName.charAt(0).toUpperCase() + oldMethodName.slice(1)
		}

		return scope.update(newName, newNamespace, newPath, method)
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
		const className = source.getShortClassName()
		const propName = className.charAt(0).toLowerCase() + className.slice(1)

		let setup = ''
		switch (target.type) {
			case 'class':
				setup = `new ${className}`
				break
			case 'trait':
				setup = `$this->getMockForTrait(${className}::class)`
				break
			case 'abstract':
				setup = `$this->getMockForAbstractClass(${className}::class)`
				break
		}

		const code = [
			'<?php',
			'declare(strict_types=1);',
			'',
			`namespace ${removeLeadingChars('\\', target.getNamespace())};`,
			'',
			'use PHPUnit\\Framework\\TestCase;',
			`use ${removeLeadingChars('\\', source.getFullClassName())};`,
			'',
			`class ${target.getShortClassName()} extends TestCase`,
			'{',
			tab + '/**',
			tab + ` * @var ${className}`,
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
		if (target.hasMethod() && source.hasMethod()) {
			const code = [
				'',
				tab + '/**',
				tab + ` * @covers ${removeLeadingChars('\\', source.getFullClassName())}::${source.getMethodName()}`,
				tab + ' */',
				tab + `public function ${target.getMethodName()}()`,
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
