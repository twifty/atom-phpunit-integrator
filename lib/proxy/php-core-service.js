/** @babel */

import Parser from 'php-parser'
import { Point, Range } from 'atom'
import { readFile, fileExists } from '../util/php-unit-utils'

import PhpClassInfo from './php-class-info'
import PhpMethodInfo from './php-method-info'

/**
 * The integrator base service will be dropped in version 4. This is a workaround.
 */
export default class PhpCoreService
{
    /**
     * Constructor
     *
     * @constructor
     */
    constructor () {
        this.proxy = null
        this.indexingMediator = null
        this.projectManager = null
        this.cache = {}
        this.error = {}

        this.parser = new Parser({
            parser: {
                php7: true
            },
            ast: {
                withPositions: true
            }
        });

        this.isActivated = false
    }

    /**
     * Returns the classnames found in the given file
     *
     * @param  {String}   file      - The full path to the file
     * @param  {String}   [content] - The optional content of the file
     *
     * @return {Promise<Array<PhpClassInfo>|Null>}
     */
    async getClassInfosForFile (file, content = null) {
        if (!await fileExists(file)) {
            delete this.cache[file]

            return null
        }

        return this.cache[file] || await this.loadCache(file, content || await readFile(file))
    }

    /**
     * Returns the info for a single class within a file
     *
     * @param  {String}  file      - The full path to the file
     * @param  {String}  className - The name of the class to query
     * @param  {String}  [content] - The file contents if available
     *
     * @return {Promise<PhpClassInfo|Null>}
     */
    async getClassInfo (file, className, content = null) {
        const classInfos = await this.getClassInfosForFile(file, content)

        if (classInfos) {
            for (const classInfo of classInfos) {
                if (classInfo.getFullClassName() === className) {
                    return classInfo
                }
            }
        }

        return null
    }

    /**
     * Updates the database after changes to a file
     *
     * @param  {String} file      - The full path to the file
     * @param  {String} [content] - The file contents if available
     *
     * @return {Promise<Array<PhpClassInfo>|Null>}
     */
    async reindex (file, content = null) {
        return this.loadCache(file, content || await readFile(file))
    }

    /**
     * Returns the ParseError for a file if anything went wrong
     *
     * @param  {String} file      - The full path of the file
     *
     * @return {ParseError|Null}  - The caught error
     */
    getParseError (file) {
        return this.error[file] || null
    }

    /**
     * Parses a file and loads the results into the cache
     *
     * @private
     * @param  {String}  file        - The full path of the file to check
     * @param  {String}  content     - The file content if readily available
     *
     * @return {Array<PhpClassInfo>} - Resolves when complete
     */
    loadCache (file, content) {
        delete this.cache[file]
        delete this.error[file]

        function * filterChildren (children, type) {
            if (!Array.isArray(type)) {
                type = [type]
            }

            for (const child of children) {
                if (-1 !== type.indexOf(child.kind)) {
                    yield child
                }
            }
        }

        function getRange (astNode) {
            // NOTE rows are 0 based, lines are 1 based. Points contain rows
            const start = new Point(astNode.loc.start.line, astNode.loc.start.column)
            const end = new Point(astNode.loc.end.line, astNode.loc.end.column)

            return new Range(start, end)
        }

        function parseName (name) {
            const segments = name.split('\\').filter((v) => v != null && v != '')
            const qualified = '\\' === name.charAt(0)

            return {
                isQualified: qualified,
                qualified: '\\' + segments.join('\\'),
                unqualified: segments.join('\\'),
                segments,
                first: segments[0],
                last: segments[segments.length - 1],
                length: segments.length,
            }
        }

        try {
            const ast = this.parser.parseCode(content)
            const entries = []

            if (ast.kind === 'program') {
                for (const namespaceNode of filterChildren(ast.children, 'namespace')) {
                    const namespace = parseName(namespaceNode.name).qualified
                    const uses = {}

                    for (const useGroup of filterChildren(namespaceNode.children, 'usegroup')) {
                        for (const useItem of filterChildren(useGroup.items, 'useitem')) {
                            const name = parseName(useItem.name)
                            const alias = useItem.alias || name.last

                            uses[alias] = name.qualified
                        }
                    }

                    for (const classInfo of filterChildren(namespaceNode.children, ['class', 'trait'])) {
                        const name = classInfo.name
                        const range = getRange(classInfo)
                        const type = classInfo.kind === 'trait' ? 'trait' : (classInfo.isAbstract ? 'abstract' : 'class')

                        let parent = null
                        if (classInfo.extends) {
                            const parsed = parseName(classInfo.extends.name)

                            if (!parsed.isQualified) {
                                if (parsed.first in uses) {
                                    parent = uses[parsed.first] + '\\' + parsed.segments.slice(1).join('\\')
                                } else {
                                    parent = namespace + parsed.qualified
                                }
                            } else {
                                parent = parsed.qualified
                            }
                        }

                        const methods = {}
                        for (const methodInfo of filterChildren(classInfo.body, 'method')) {
                            const name = methodInfo.name

                            methods[name] = new PhpMethodInfo(name, methodInfo.visibility, getRange(methodInfo), methodInfo.isAbstract)
                        }

                        entries.push(new PhpClassInfo(file, namespace, name, range, type, parent, methods))
                    }
                }

                this.cache[file] = entries
            }
        } catch (error) {
            if (error.constructor.name === 'SyntaxError') {
                this.error[file] = error

                return null
            }

            throw error
        }

        return this.cache[file]
    }
}
