/** @babel */
/** @jsx etch.dom */
/* global window atom */

import etch from 'etch'
import {CompositeDisposable} from 'atom'

export default class PhpUnitSkelgenView
{
    /**
     * Constructor
     *
     * @constructor
     */
    constructor () {
        this.disposables = new CompositeDisposable()

        etch.initialize(this)

        this.disposables.add(atom.commands.add(this.element, {
            'core:cancel': (e) => {
                this.onCancel()
                e.stopPropagation()
            }
        }))

        this.modal = atom.workspace.addModalPanel({item: this.element, visible: false})

        this.windowListener = (event) => {
            if (!this.element.contains(event.target)) {
                this.onCancel()
            }
        }
    }

    /**
     * Required by etch
     */
    update () {}

    /**
     * Destructor
     */
    destroy () {
        this.disposables.dispose()
        this.modal.destroy()
        etch.destroy(this)
    }

    /**
     * Opens the dialog prompt
     *
     * @param  {Object} source          - The target class data
     * @param  {String} source.fqcn     - The fully qualified classname of the target class
     * @param  {String} [source.method] - A method name to create in the above class
     * @param  {Function} onConfirm     - The function to invoke when the dialog closes
     *
     * @return {Promise}                - Resolves with nothing
     */
    open (source, onConfirm) {
        this.source = source
        this.confirmHandler = onConfirm


        return etch.update(this).then(() => {
            window.addEventListener('mousedown', this.windowListener)
            this.modal.show()
            this.refs.but2.focus()
        })
    }

    /**
     * The confirm button handler
     *
     * @private
     */
    onConfirm () {
        window.removeEventListener('mousedown', this.windowListener)
        this.modal.hide()
        this.confirmHandler(this.source)
    }

    /**
     * The cancel button handler
     *
     * @private
     */
    onCancel () {
        window.removeEventListener('mousedown', this.windowListener)
        this.modal.hide()
        this.confirmHandler(false)
    }

    /**
     * Handles tabbing between the buttons
     *
     * @private
     * @param  {MouseEvent} event - The DOM mouse event
     */
    onKeyPress (event) {
        if ('Tab' === event.key) {
            event.preventDefault()

            if (event.target === this.refs.but1) {
                this.refs.but2.focus()
            } else if (event.target === this.refs.but2) {
                this.refs.but1.focus()
            }
        } else if ('Enter' === event.key) {
            event.preventDefault()

            if (event.target === this.refs.but1) {
                this.onConfirm()
            } else if (event.target === this.refs.but2) {
                this.onCancel()
            }
        }
    }

    /**
     * Creates the dialog virtual DOM
     *
     * @private
     * @return {VirtualDom} - The virtual DOM node
     */
    render () {
        let type = 'class'
        let name = ''

        if (this.source) {
            name = this.source.getFullClassName()

            if (this.source.getMethodName()) {
                type = 'case'
                name += '::' + this.source.getMethodName()
            }
        }

        return (
            <div onKeyDown={this.onKeyPress} className="php-unit-integrator php-unit-skelgen">
                <span>The following test {type} does not exist.</span>
                <span>{name}</span>
                <span>Would you like to create it?</span>
                <div>
                    <button ref="but1" className="btn" onClick={this.onConfirm} tabIndex="0">Yes</button>
                    <button ref="but2" className="btn" onClick={this.onCancel} tabIndex="1">No</button>
                </div>
            </div>
        )
    }
}
