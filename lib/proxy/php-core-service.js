/** @babel */
/* global console */

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
     * @return {Promise<Array<PhpClassInfo>>}
     */
    async getClassInfosForFile (file, content = null) {
        try {
            if (!await fileExists(file)) {
                delete this.cache[file]

                return []
            }

            return this.cache[file] || await this.loadCache(file, content)
        } catch (error) {
            console.error(error)
        }
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
     * @return {Promise<Array<PhpClassInfo>>}
     */
    reindex (file, content = null) {
        return this.loadCache(file, content)
    }

    /**
     * Parses a file and loads the results into the cache
     *
     * @private
     * @param  {String}  file                 - The full path of the file to check
     * @param  {String}  [content]            - The file content if readily available
     *
     * @return {Promise<Array<PhpClassInfo>>} - Resolves when complete
     */
    async loadCache (file, content = null) {
        if (!content) {
            content = await readFile(file)
        }

        this.cache[file] = []

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
            const segments = name.split('\\').filter((v) => v != null)

            return {
                full: '\\' + segments.join('\\'),
                segments,
                last: segments[segments.length - 1]
            }
        }

        try {
            const ast = this.parser.parseCode(content)

            if (ast.kind === 'program') {
                for (const namespaceNode of filterChildren(ast.children, 'namespace')) {
                    const namespace = parseName(namespaceNode.name).full
                    const uses = {}

                    for (const useGroup of filterChildren(namespaceNode.children, 'usegroup')) {
                        for (const useItem of filterChildren(useGroup.items, 'useitem')) {
                            const name = parseName(useItem.name)
                            const alias = useItem.alias || name.last

                            uses[alias] = name.full
                        }
                    }

                    for (const classInfo of filterChildren(namespaceNode.children, ['class', 'trait'])) {
                        const name = classInfo.name
                        const range = getRange(classInfo)
                        const type = classInfo.kind === 'trait' ? 'trait' : (classInfo.isAbstract ? 'abstract' : 'class')

                        let parent = null
                        if (classInfo.extends) {
                            const alias = classInfo.extends.name

                            if (!(alias in uses)) {
                                throw new Error(`Failed to resolve extends for '${alias}' in (${Object.keys(uses)})`)
                            }

                            parent = uses[alias]
                        }

                        const methods = {}
                        for (const methodInfo of filterChildren(classInfo.body, 'method')) {
                            const name = methodInfo.name

                            methods[name] = new PhpMethodInfo(name, methodInfo.visibility, getRange(methodInfo), methodInfo.isAbstract)
                        }

                        this.cache[file].push(new PhpClassInfo(file, namespace, name, range, type, parent, methods))
                    }
                }
            }
        } catch (error) {
            console.log(error)

            delete this.cache[file]

            return null
        }

        return this.cache[file]
    }
}
