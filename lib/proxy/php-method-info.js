/** @babel */

export default class PhpMethodInfo
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String}  name       - The name of the method
     * @param {String}  visibilty  - One of 'public', 'protected' or 'private'
     * @param {Range}   range      - The starting and ending point of the block
     * @param {Boolean} isAbstract - Indicates an abstract method
     */
    constructor (name, visibilty, range, isAbstract) {
        this.name = name
        this.visibilty = visibilty
        this.range = range
        this.abstract = isAbstract
    }

    /**
     * Returns the name of the method
     *
     * @return {String}
     */
    getName () {
        return this.name
    }

    /**
     * Returns one of 'public', 'protected' or 'private
     * '
     * @return {String}
     */
    getVisibility () {
        return this.visibilty
    }

    /**
     * Returns the starting and ending points of the method
     *
     * @return {Range}
     */
    getRange () {
        return this.range
    }

    /**
     * Checks if the methods visibility is public
     *
     * @return {Boolean}
     */
    isPublic () {
        return 'public' === this.visibilty
    }

    /**
     * Checks if the method is abstract
     *
     * @return {Boolean}
     */
    isAbstract () {
        return this.abstract
    }
}
