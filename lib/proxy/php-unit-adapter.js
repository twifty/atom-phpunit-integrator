/** @babel */
/* global require console */

import Path from 'path'

import {getFiles} from '../util/php-unit-utils'
import DefaultAdapter from './php-unit-default-adapter'

class UserAdapter extends DefaultAdapter
{
    constructor(methods) {
        super()

        for (const func in methods) {
            this[func] = methods[func].bind(this)
        }
    }
}

export default class PhpUnitAdapter
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String}        projectRoot  - The full path to the root of the containing project
     * @param {Array<String>} adapterFiles - The file names of allowable adapters
     */
    constructor (projectRoot, adapterFiles) {
        this.projectRoot = projectRoot
        this.adapterFiles = adapterFiles
        this.adapterCache = {}
        this.defaultAdapater = new DefaultAdapter()
    }

    async adapterForScope (scope) {
        let path = Path.dirname(scope.getPath())

        do {
            if (path in this.adapterCache) {
                return this.adapterCache[path]
            }

            const entries = await getFiles(path, false, ({basename}) => {
                return -1 === this.adapterFiles.indexOf(basename)
            })

            if (entries.length) {
                const adapterFile = entries[0]

                try {
                    const methods = require(adapterFile)
                    const instance = new UserAdapter(methods)

                    this.adapterCache[path] = instance

                    return this.adapterCache[path]
                } catch (error) {
                    console.error(`Adapter '${adapterFile}' could not be imported:`, error)
                }
            }

            path = Path.dirname(path)
        } while (path.startsWith(this.projectRoot))

        return this.defaultAdapater
    }

    async describe (scope) {
        const adapter = await this.adapterForScope(scope)

        return adapter.describeTarget(scope)
    }

    /**
     * Creates the PHP code for the test suite class
     *
     * @param  {Object} source - A description of the source class
     * @param  {Object} target - A description of the target class
     *
     * @return {String|{text: string, cursor: Point=, select: Range=}}
     */
    async createTestSuite (source, target) {
        const adapter = await this.adapterForScope(source)

        return adapter.createTestSuite(source, target)
    }

    /**
     * Creates the PHP function to add to the main test suite
     *
     * @param  {Object} source - A description of the source method
     * @param  {Object} target - A description of the target method
     *
     * @return {String|{text: string, cursor: Point=, select: Range=}}
     */
    async createTestCase (source, target) {
        const adapter = await this.adapterForScope(source)

        return adapter.createTestCase(source, target)
    }
}
