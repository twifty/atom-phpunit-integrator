/** @babel */

export default class PhpClassInfo
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String} path      - The full path to the containing file
     * @param {String} namespace - The namespace of the class, with leading slash
     * @param {String} name      - The short name of the class
     * @param {Range}  range     - The starting and ending points of the class
     * @param {String} [type]    - One of 'class', 'trait' or 'abstract'
     * @param {String} [parent]  - The fully qualified name of the extended parent
     * @param {Object} [methods] - A map of method name to PhpMethodInfo
     */
    constructor (path, namespace, name, range, type = 'class', parent = null, methods = {}) {
        this.path = path
        this.namespace = namespace
        this.name = name
        this.range = range
        this.type = type
        this.parent = parent
        this.methods = methods
        this.test = '\\PHPUnit\\Framework\\TestCase' === this.parent
    }

    /**
     * Returns the path to the source
     *
     * The path may not exist on disk.
     *
     * @return {String}
     */
    getPath () {
        return this.path
    }

    /**
     * Checks if the instance represents a test file
     *
     * @return {Boolean}
     */
    isTestFile () {
        return this.test
    }

    /**
     * Returns the short name of the class
     *
     * @return {String}
     */
    getShortClassName () {
        return this.name
    }

    /**
     * Returns the fully qualified name of the class
     *
     * @return {String}
     */
    getFullClassName () {
        return this.namespace + '\\' + this.name
    }

    /**
     * Returns the namespace name of the class
     *
     * @return {String}
     */
    getNamespace () {
        return this.namespace
    }

    /**
     * Returns the range, if present, of the class within the source file
     *
     * @return {Range|Null}
     */
    getRange () {
        return this.range
    }

    /**
     * Returns one of 'class', 'trait' or 'abstract'
     *
     * @return {String}
     */
    getType () {
        return this.type
    }

    /**
     * Returns the fully qualified name of the extended parent class
     *
     * @return {String}
     */
    getParent () {
        return this.parent
    }

    /**
     * Checks if the class represents a test case
     *
     * @return {Boolean}
     */
    isTest () {
        return this.test
    }

    /**
     * Checks if a named method exists
     *
     * @param  {String}  name - The name of the method to search for
     *
     * @return {Boolean}
     */
    hasMethod (name) {
        return name in this.methods
    }

    /**
     * Returns the named method
     *
     * @param  {String} name - The name of the method to return
     *
     * @return {PhpMethodInfo}
     */
    getMethod (name) {
        return this.methods[name]
    }

    /**
     * Returns all methods
     *
     * @return {Array<PhpMethodInfo>}
     */
    getMethods () {
        return Object.values(this.methods)
    }
}
