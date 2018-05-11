/** @babel */

import Path from 'path'

import {removeLeadingChars, offsetRange, offsetPoint} from '../util/php-unit-utils'

/**
 * An encapsulation of how and where to create the test files/classes/methods
 */
export default class DefaultAdapter
{
    /**
     * Creates a description of the target class/method based on the source
     *
     * The given object is a clone and safe to modify and return.
     *
     * @param  {PhpUnitScope} scope - A description of the source
     *
     * @return {PhpUnitScope}       - The translated scope
     */
    describeTarget (scope) {
        if (scope.isTestFile()) {
            throw new Error('An invalid source was passed to describeTarget')
        }

        const sourceClassName     = scope.getShortClassName()
        const sourceNamespace     = scope.getNamespace()
        const sourceFileName      = Path.basename(scope.getPath())
        const sourcePath          = scope.getPath()
        const sourceMethodName    = scope.getMethodName()
        const sourceDirectoryName = this.getSourceDirectoryName()

        const leadingSegments  = sourceNamespace.slice(1).split('\\')
        const trailingSegments = []

        const targetClassName = this.getTargetClassName(sourceClassName)
        let targetPath, targetNamespace, targetMethod
        let rootPath = Path.dirname(sourcePath)

        if (sourcePath !== rootPath) {
            while (Path.basename(rootPath) === leadingSegments.slice(-1)) {
                rootPath = Path.dirname(rootPath)
                trailingSegments.unshift(leadingSegments.pop())
            }

            if (sourceDirectoryName === Path.basename(rootPath)) {
                rootPath = Path.dirname(rootPath)

                const targetFileName = this.getTargetFileName({
                    sourceFileName,
                    sourceClassName,
                    targetClassName
                })

                targetPath = this.getTargetPath({
                    sourcePath,
                    rootPath,
                    trailingSegments,
                    targetFileName
                })

                targetNamespace = this.getTargetNamespaceName({
                    sourceNamespace,
                    leadingSegments,
                    trailingSegments
                })
            }
        }

        if (!targetPath || !targetNamespace) {
            return null
        }

        if (sourceMethodName) {
            targetMethod = this.getTargetMethodName(sourceMethodName)
        }

        return scope.update({
            name: targetClassName,
            namespace: targetNamespace,
            path: targetPath,
            method: targetMethod
        })
    }

    /**
     * Returns the directory name under which source files are stored
     *
     * @return {String}
     */
    getSourceDirectoryName () {
        return 'src'
    }

    /**
     * Returns the directory name under which the test files are stored
     *
     * @return {String}
     */
    getTargetDirectoryName () {
        return 'tests'
    }

    /**
     * Returns the namespace segment for the target test directory
     *
     * @return {String}
     */
    getTargetNamespaceSegment () {
        return 'Test'
    }

    /**
     * Returns the short class name for the target test class
     *
     * @param  {String} sourceClassName - The short class name of the source class
     *
     * @return {String}
     */
    getTargetClassName (sourceClassName) {
        return sourceClassName + 'Test'
    }

    /**
     * Returns the namespace under which the target class will be created
     *
     * @param  {Object}        params                  - A collection of parameters which may help to build the string
     * @param  {String}        params.sourceNamespace  - The full namespace under which the source class was declared
     * @param  {Array<String>} params.leadingSegments  - The namespace segments up to the source directory (exclusive)
     * @param  {Array<String>} params.trailingSegments - The namespace segments from the source directory (inclusive)
     *
     * @return {String}                                - The full namespace, with leading slashes
     */
    getTargetNamespaceName ({sourceNamespace, leadingSegments, trailingSegments}) { // eslint-disable-line no-unused-vars
        return '\\' + leadingSegments.concat(this.getTargetNamespaceSegment(), trailingSegments).join('\\')
    }

    /**
     * Returns the name of the file containing the test class
     *
     * @param  {Object} params                 - A collection of parameters which may help to build the string
     * @param  {String} params.sourceFileName  - The name of the file containing the source class
     * @param  {String} params.sourceClassName - The short class name of the source class
     * @param  {String} params.targetClassName - The modified short name of the target class
     *
     * @return {String}                        - The file name with extension
     */
    getTargetFileName ({sourceFileName, sourceClassName, targetClassName}) { // eslint-disable-line no-unused-vars
        return targetClassName + '.php'
    }

    /**
     * Returns the directory path where the target file resides
     *
     * @param  {Object}        params                  - A collection of parameters which may help to build the string
     * @param  {String}        params.sourcePath       - The full path to the source directory containing the source class
     * @param  {String}        params.rootPath         - The full path to the directory containing both source and target directories
     * @param  {Array<String>} params.trailingSegments - The namespace segments from the source directory (inclusive)
     * @param  {String}        params.targetFileName   - The translated target file name to append
     *
     * @return {String}                                - The full path to the target file
     */
    getTargetPath ({sourcePath, rootPath, trailingSegments, targetFileName}) { // eslint-disable-line no-unused-vars
        return Path.join(rootPath, this.getTargetDirectoryName(), ...trailingSegments, targetFileName)
    }

    /**
     * Returns the method name within the target class
     *
     * @param  {String} sourceMethodName - The source method being tested
     *
     * @return {String}                  - The test method name
     */
    getTargetMethodName (sourceMethodName) {
        return 'test' + sourceMethodName.charAt(0).toUpperCase() + sourceMethodName.slice(1)
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
        const tab = this.getIndent()

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
            '/**',
            ` * Test Case for the ${className} ${target.type === 'trait' ? 'trait' : 'class'}.`,
            ' */',
            `class ${target.getShortClassName()} extends TestCase`,
            '{',
            tab + '/**',
            tab + ` * @var ${className}`,
            tab + ' */',
            tab + `protected $${propName};`,
            '',
            tab + '/**',
            tab + ' * This method is called before each test.',
            tab + ' */',
            tab + 'protected function setUp()',
            tab + '{',
            tab + tab + `$this->${propName} = ${setup};`,
            tab + '}',
            '',
            tab + '/**',
            tab + ' * This method is called after each test.',
            tab + ' */',
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
        const tab = this.getIndent()

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
                cursor: [6, tab.length * 2],
                select: [[6, tab.length * 2], [6, 65 + (tab.length * 2)]]
            }
        }

        return ''
    }

    /**
     * Returns the character(s) required to indent a line
     *
     * @return {String} - A single indentation
     */
    getIndent () {
        return '    '
    }
}
