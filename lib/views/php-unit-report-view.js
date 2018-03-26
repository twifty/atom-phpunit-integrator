/** @babel */
/** @jsx etch.dom */
/* global Promise atom document */

import etch from 'etch'
import {Emitter, CompositeDisposable} from 'atom'

import {EtchTreeView, EtchTreeNode} from '../etch/components'
import {openInAtom} from '../util/php-unit-utils'

const LINK_EXP = /^((?:[A-Z]:\\|\/).+):(\d+)$/
const NEW_LINE = /\r?\n/

const icons = {
  passed: 'fa fa-check-square-o php-test-passed',
  error: 'fa fa fa-times-circle-o php-test-error',
  warning: 'fa fa-exclamation-triangle php-test-warning',
  failure: 'fa fa-exclamation-triangle php-test-failure',
  skipped: 'fa fa-pause-circle-o php-test-skipped'
}

function linkify (text) {
  const handle = (file, line) => {
    return () => {
      return openInAtom(file, line)
    }
  }

  // NOTE: While the text will most often times be a PHP exception message, this
  // is not always the case, so styling the lines will lead to display problems.
  return text.trim().split(NEW_LINE).map(line => {
    const match = LINK_EXP.exec(line)

    if (match) {
      return <div><span className="file-link" onClick={ handle(match[1], match[2]) }>{ line }</span></div>
    } else if (line) {
      return <div><span>{ line }</span></div>
    } else {
      // etch calls document.createTextNode which escapes the '&'
      return etch.dom(function() {
        this.element = document.createElement('div')
        this.element.innerHTML = "<span>&nbsp;</span>"
        this.update = () => {}
      })
    }
  })
}

export default class PhpUnitReportView
{
  constructor (properties) {
    this.emitter = new Emitter()
    this.listeners = new CompositeDisposable()
    this.filteredState = {}

    if (properties.onRunSuite) {
      this.emitter.on('run-suite', properties.onRunSuite)
    }

    if (properties.onRunSelection) {
      this.emitter.on('run-selected', properties.onRunSelection)
    }

    if (properties.onClearAll) {
      this.emitter.on('clear-all', properties.onClearAll)
    }

    etch.initialize(this)

    this.listeners.add(atom.commands.add(this.element, {
      'php-unit-integrator:report-goto-test': () => {
        const active = atom.contextMenu.activeElement

        if (active) {
          for (const name in this.refs) {
            if (name.startsWith('item')) {
              const ref = this.refs[name].element

              if (active === ref || ref.contains(active)) {
                const file = ref.dataset.file
                const line = ref.dataset.line

                openInAtom(file, line)

                break
              }
            }
          }
        }
      }
    }))
  }

  update (properties) {
    if (properties.report !== this.report) {
      this.report = properties.report
      this.root = properties.root

      if (this.report) {
        return this.report.getTestSuites().then(meta => {
          this.meta = meta

          return etch.update(this)
        })
      } else {
        this.meta = null

        return etch.update(this)
      }
    }

    return Promise.resolve()
  }

  onClearAll (cb) {
    return this.emitter.on('clear-all', cb)
  }

  scheduleUpdate (cb) {
    atom.views.updateDocument(cb)

    return atom.views.getNextUpdatePromise()
  }

  onClickButton (action) {
    const selected = []

    switch (action) {
      case 'run-selected':
        this.refs.tree.getChildNodes().forEach(node => {
          if (node.isSelected()) {
            selected.push(node.getDataSetValue('name'))
          } else {
            node.getChildNodes().forEach(child => {
              if (child.isSelected()) {
                selected.push(child.getDataSetValue('name'))
              }
            })
          }
        })
        this.emitter.emit(action, selected)
        break

      case 'run-suite':
      case 'clear-all':
        this.emitter.emit(action)
    }
  }

  onSelectListItem (node) {
    const parentNode = node.getParentNode()
    const selected = node.isSelected()

    if (parentNode instanceof EtchTreeView) {
      node.getChildNodes().forEach(child => {
        child.setSelected(selected)
      })
    } else if (selected) {
      const childNodes = parentNode.getChildNodes()
      let selectedChildrenCount = 0

      for (let i = 0; i < childNodes.length; i++) {
        const child = childNodes[i]

        if (child.isSelected()) {
          selectedChildrenCount++
        } else {
          break
        }
      }

      if (selectedChildrenCount === childNodes.length) {
        parentNode.setSelected(true)
      }
    } else {
      parentNode.setSelected(false)
    }
  }

  onFilterList (state) {
    const turnOn = this.filteredState[state] === undefined
    const button = this.refs['btn-' + state]

    this.scheduleUpdate(() => {
      if (turnOn) {
        this.filteredState[state] = true

        button.classList.add('active')
      } else {
        delete this.filteredState[state]

        button.classList.remove('active')
      }

      const enableAll = Object.keys(this.filteredState).length === 0

      this.refs.tree.getChildNodes().forEach(treeNode => {
        const childNodes = treeNode.getChildNodes()
        let visibleNodes = childNodes.length

        childNodes.forEach(node => {
          if (enableAll || this.filteredState[node.element.dataset.state]) {
            node.setDisabled(false)
          } else {
            node.setDisabled(true)
            visibleNodes--
          }
        })

        if (visibleNodes === 0) {
          treeNode.setDisabled(true)
        } else {
          treeNode.setDisabled(false)
        }
      })
    })
  }

  createListItem (testCase, children) {
    let error = testCase[testCase.state]
    let collapsed = false
    let state = testCase.state
    let className = ''

    const dataset = {
      state: testCase.state,
      name: testCase.name
    }

    if (testCase.file) {
      dataset.file = testCase.file
      dataset.line = testCase.line

      className = 'has-navigation'
    }

    if (testCase.state === 'passed') {
      state += ' (' + testCase.time + 's)'
    }

    if (error && error.data) {
      collapsed = true
      error = (
        <li className="list-item"><div className="error-message">{ linkify(error.data) }</div></li>
      )
    } else {
      error = null
    }

    return (
      <EtchTreeNode
        className={ className }
        dataset={ dataset }
        onDidSelect={ this.onSelectListItem.bind(this) }
        collapsed={ collapsed }
        icon={ icons[testCase.state] }
      >
        <span>
          <span>{ testCase.name }</span>
          <span className={ 'test-state php-test-' + testCase.state }>{ state }</span>
        </span>
        { error }
        { children || null }
      </EtchTreeNode>
    )
  }

  render () {
    const children = []
    const seenStates = []

    if (this.meta) {
      this.meta.forEach(testSuite => {
        const nodes = testSuite.cases.map((testCase) => {
          if (-1 === seenStates.indexOf(testCase.state)) {
            seenStates.push(testCase.state)
          }

          return this.createListItem(testCase)
        })

        children.push(this.createListItem(testSuite, nodes))
      })
    }

    let filters = [];
    ['passed', 'error', 'warning', 'failure', 'skipped'].forEach((state) => {
      if (0 <= seenStates.indexOf(state)) {
        filters.push(
          <li>
            <button
              ref={'btn-' + state}
              onClick={ this.onFilterList.bind(this, state) }
              className={ 'icon fa-lg ' + icons[state] }
            />
          </li>
        )
      }
    })

    if (filters.length <= 1) {
      filters = []
    } else {
      filters.unshift(
        <li><divider /></li>
      )
    }

    let clearDisabled = children.length ? {} : {disabled: true}

    return (
      <div className="php-unit-report-view">
        <ul className="php-unit-report-nav">
          <li>
            <button
              onClick={this.onClickButton.bind(this, 'run-suite')}
              className={ 'icon fa-lg fa fa-forward' }
            />
          </li>
          <li>
            <button
              disabled={true}
              onClick={this.onClickButton.bind(this, 'run-selected')}
              className={ 'icon fa-lg fa fa-play' }
            />
          </li>
          <li>
            <button
              onClick={this.onClickButton.bind(this, 'clear-all')}
              className={ 'icon fa-lg fa fa-trash-o' }
              { ...clearDisabled }
            />
          </li>
          { filters }
        </ul>
        <EtchTreeView ref="tree" className="php-unit-report-tree" >
          { children }
        </EtchTreeView>
      </div>
    )
  }
}
