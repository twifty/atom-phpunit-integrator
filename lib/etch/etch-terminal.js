/** @babel */
/** @jsx etch.dom */
/* global Promise Symbol document window atom */

import etch from 'etch'

import EtchComponent from './etch-component'
import symbols from './symbols'

const createNewLine = Symbol()
const buildAttributes = Symbol()
const createLineData = Symbol()
const setState = Symbol()
const forEachToken = Symbol()
const resetData = Symbol()

const classes = [
  "ansi-black",
  "ansi-red",
  "ansi-green",
  "ansi-yellow",
  "ansi-blue",
  "ansi-magenta",
  "ansi-cyan",
  "ansi-white",
  "ansi-bright-black",
  "ansi-bright-red",
  "ansi-bright-green",
  "ansi-bright-yellow",
  "ansi-bright-blue",
  "ansi-bright-magenta",
  "ansi-bright-cyan",
  "ansi-bright-white",
]

const palette = [
  [  0,   0,   0], // class_name: "ansi-black"
  [187,   0,   0], // class_name: "ansi-red"
  [  0, 187,   0], // class_name: "ansi-green"
  [187, 187,   0], // class_name: "ansi-yellow"
  [  0,   0, 187], // class_name: "ansi-blue"
  [187,   0, 187], // class_name: "ansi-magenta"
  [  0, 187, 187], // class_name: "ansi-cyan"
  [255, 255, 255], // class_name: "ansi-white"
  [ 85,  85,  85], // class_name: "ansi-bright-black"
  [255,  85,  85], // class_name: "ansi-bright-red"
  [  0, 255,   0], // class_name: "ansi-bright-green"
  [255, 255,  85], // class_name: "ansi-bright-yellow"
  [ 85,  85, 255], // class_name: "ansi-bright-blue"
  [255,  85, 255], // class_name: "ansi-bright-magenta"
  [ 85, 255, 255], // class_name: "ansi-bright-cyan"
  [255, 255, 255], // class_name: "ansi-bright-white"
]

// Index 16..231 : RGB 6x6x6
// https://gist.github.com/jasonm23/2868981#file-xterm-256color-yaml
const levels = [0, 95, 135, 175, 215, 255];
for (let r = 0; r < 6; ++r) {
  for (let g = 0; g < 6; ++g) {
    for (let b = 0; b < 6; ++b) {
      palette.push([levels[r], levels[g], levels[b]])
    }
  }
}

// Index 232..255 : Grayscale
for (let i = 0, grey = 8; i < 24; ++i, grey += 10) {
  palette.push([grey, grey, grey])
}

const DEFAULT_BACKGROUND = palette[0]
const DEFAULT_FOREGROUND = palette[7]
const DEFAULT_STATE = {
  foreground: DEFAULT_FOREGROUND,
  background: DEFAULT_BACKGROUND,
  invert: false,
  conceal: false,

  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,

  blinkSlow: false,
  blinkFast: false,
}

class Token
{
  constructor () {
    this.mode = null
    this.args = []
    this.modifier = null
    this.command = null
    this.text = ''

    this.currArg = ''
  }

  finalize () {
    if (this.currArg) {
      this.args.push(this.currArg)
      this.currArg = null
    }
  }

  isValid () {
    return !!(this.command || this.text)
  }

  toString () {
    let c = this.mode || ''
    c += this.args.join(';')
    c += this.modifier || ''
    c += this.command || ''
    c += this.text
    return c
  }
}

export default class EtchTerminal extends EtchComponent
{
  constructor () {
    super(...arguments)

    if (this[symbols.self].properties.onPreRenderLine) {
      this.on('pre-render-line', this[symbols.self].properties.onPreRenderLine)
    }
  }

  clear () {
    return this[symbols.scheduleUpdate](() => {
      this[resetData]()
      this[createNewLine]()

      etch.updateSync(this)
    })
  }

  write (data) {
    return this[symbols.scheduleUpdate](() => {
      this[forEachToken](data, token => {
        this[setState](token)

        if ('\n' === token.text) {
          const lineElement = this[symbols.self].currLine

          this[createNewLine]()

          if (this[symbols.self].currLineIndex > 0) {
            this[symbols.emit]('pre-render-line', {
              term: this,
              line: lineElement
            })
          }
        } else if (token.text) {
          this[createLineData](token.text)
        }
      })
      etch.updateSync(this)
    })
  }

  writeln (data) {
    return this.write(data + '\n')
  }

  getSelection () {
    const selection = window.getSelection()

    if (this.element.contains(selection.anchorNode) && this.element.contains(selection.focusNode)) {
      return selection.toString()
    }

    return ''
  }

  copySelection () {
    const selection = this.getSelection()
    atom.clipboard.write(selection)

    return selection
  }

  selectAll () {
    const selection = window.getSelection()
    selection.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(this.element)
    selection.addRange(range)
  }

  render () {
    return (
      <ul
        className={ this[symbols.getClassName]('etch-term native-key-bindings', 'native-key-bindings') }
        tabIndex="-1"
      >{ this[symbols.self].lines }</ul>
    )
  }

  update () {
    return Promise.resolve()
  }

  [symbols.initialize] () {
    this[resetData]()
    this[createNewLine]()

    document.onselectionchange = () => {
      const selection = window.getSelection()
      const selectedNode = selection.baseNode

      if (!selectedNode || selectedNode !== this.element || this.element.contains(selectedNode)) {
        if (selection.isCollapsed) {
          this.element.classList.remove('has-selection')
        } else {
          this.element.classList.add('has-selection')
        }
      }
    }
  }

  [resetData] () {
    this[symbols.self].lines = []
    this[symbols.self].buffer = ''

    Object.assign(this[symbols.self], DEFAULT_STATE)
  }

  [createNewLine] () {
    const attributes = this[buildAttributes]()
    const {classes, styles} = attributes

    const line = document.createElement('li')

    line.classList.add('etch-term-line', ...classes)

    for (const name in styles) {
      line.style[name] = styles[name]
    }

    this[symbols.self].currLineState = attributes
    this[symbols.self].currLineIndex = this[symbols.self].lines.length
    this[symbols.self].currLine = line

    this[symbols.self].lines.push({tag: function () {
      // NOTE unbound functions have their own 'this'
      this.element = line
    }})
  }

  [buildAttributes] ({background = null, foreground = null} = {}) {
    const classes = []
    const styles = {}

    let bg = this[symbols.self].background
    let fg = this[symbols.self].foreground

    if (this[symbols.self].invert) {
      const swap = bg
      bg = fg
      fg = swap
    }

    if (this[symbols.self].conceal) {
      fg = bg
    }

    if (background !== bg) {
      if (typeof bg === 'string') {
        classes.push(bg + '-bg')
      } else {
        styles['background-color'] = 'rgb(' + bg.join(',') + ')'
      }
    }

    if (foreground !== fg) {
      if (typeof fg === 'string') {
        classes.push(fg + '-fg')
      } else {
        styles['color'] = 'rgb(' + fg.join(',') + ')'
      }
    }

    return {classes, styles, background: bg, foreground: fg}
  }

  [createLineData] (text) {
    const {classes, styles} = this[buildAttributes](this[symbols.self].currLineState)

    function wrapElement (tag, child) {
      const wrapper = document.createElement(tag)
      wrapper.appendChild(child)

      return wrapper
    }

    let dom = document.createTextNode(text)

    if (this[symbols.self].bold) {
      dom = wrapElement('b', dom)
    }
    if (this[symbols.self].italic) {
      dom = wrapElement('i', dom)
    }
    if (this[symbols.self].underline) {
      dom = wrapElement('u', dom)
    }
    if (this[symbols.self].strikethrough) {
      dom = wrapElement('del', dom)
    }

    const span = wrapElement('span', dom)

    span.classList.add(...classes)

    for (const name in styles) {
      span.style[name] = styles[name]
    }

    this[symbols.self].currLine.appendChild(span)
  }

  [setState] (token) {
    if ('m' === token.command) {
      // See https://stackoverflow.com/a/33206814/1479092 for token args
      for (let i = 0; i < token.args.length; i++) {
        let arg = parseInt(token.args[i])

        switch (arg) {
          case 0: // Reset
            Object.assign(this[symbols.self], DEFAULT_STATE)
            break
          case 1:
            this[symbols.self].bold = true
            break
          // case 2: // Faint
          case 3: // Italic
            this[symbols.self].italic = true
            break
          case 4: // Underline
            this[symbols.self].underline = true
            break
          case 5: // Slow Blink
            this[symbols.self].blinkSlow = true
            break
          case 6: // Rapid Blink
            this[symbols.self].blinkFast = true
            break
          case 7: // Invert Colours
            this[symbols.self].invert = true
            break
          case 8: // Conceal
            this[symbols.self].conceal = true
            break
          case 9: // Crossed-Out
            this[symbols.self].strikethrough = true;
            break
          case 21: // Faint-Off
          case 22: // Bold-Off
            this[symbols.self].bold = false
            break
          case 23: // Italic-Off
            this[symbols.self].italic = false
            break
          case 24: // Underline-Off
            this[symbols.self].underline = false
            break
          case 25: // Blink Off
            this[symbols.self].blinkSlow = false
            break
          case 26: // Blink Off
            this[symbols.self].blinkFast = false
            break
          case 27: // Invert Off
            this[symbols.self].invert = false
            break
          case 28: // Conceal Off
            this[symbols.self].conceal = false
            break
          case 29: // Crossed-Out Off
            this[symbols.self].strikethrough = false
            break
          case 38:
          case 48:
            if (i + 2 < token.args.length) {
              const mode = token.args[i + 1]
              let color

              if (mode === '5') {
                const idx = parseInt(token.args[i + 2])
                if (0 <= idx && idx <= 255) {
                  color = palette[idx]
                }
                i += 2
              } else if (mode === '2' && i + 4 < token.args.length) {
                const r = parseInt(token.args[i + 2], 10)
                const g = parseInt(token.args[i + 3], 10)
                const b = parseInt(token.args[i + 4], 10)

                if ((0 <= r && r <= 255) &&
                    (0 <= g && g <= 255) &&
                    (0 <= b && b <= 255)) {
                  color = [r, g, b]
                }
                i += 4
              }

              if (arg === 38) {
                this[symbols.self].foreground = color
              } else {
                this[symbols.self].background = color
              }
            }
            break
          case 39: // Foreground Colour
            this[symbols.self].foreground = DEFAULT_FOREGROUND
            break
          case 49: // Background Colour
            this[symbols.self].background = DEFAULT_BACKGROUND
            break
          default:
            // Standard Foreground Colour
            if (30 <= arg && arg <= 37) {
              // NOTE: if bold (1) is also present 8 should be added to the index
              this[symbols.self].foreground = classes[arg - 30]
            }
            // Standard Background Colour
            else if (40 <= arg && arg <= 47) {
              // NOTE: if bold (1) is also present 8 should be added to the index
              this[symbols.self].background = classes[arg - 40]
            }
            // Bright Foreground Colour
            else if (90 <= arg && arg <= 98) {
              this[symbols.self].foreground = palette[arg - 82]
            }
            // Bright Background Colour
            else if (100 <= arg && arg <= 108) {
              this[symbols.self].background = palette[arg - 92]
            }
            break
        }
      }
    } else {
      // We could handle cursor pos and line erase here.
    }
  }

  [forEachToken] (data, cb) {
    data = this[symbols.self].buffer + data
    this[symbols.self].buffer = ''

    let nextIndex = 0

    const readNextChar = () => {
      let char = data[nextIndex]
      let code = data.charCodeAt(nextIndex)

      if (isNaN(code)) {
        return null
      }

      nextIndex += 1

      // Surrogate high
      if (0xD800 <= code && code <= 0xDBFF) {
        const low = data.charCodeAt(nextIndex)

        if (isNaN(low)) {
          this[symbols.self].buffer = char

          return null
        }

        nextIndex += 1

        if (0xDC00 <= low && low <= 0xDFFF) {
          code = ((code - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000
          char += data.charAt(nextIndex + 1)
        }
      }

      return {char, code}
    }

    let token = new Token()

    const finalizeToken = (char = '') => {
      token.text += char
      token.finalize()

      cb(token)

      token = new Token()
    }

    let parseEscape = false
    let iter = readNextChar()

    while (iter) {
      const {char, code} = iter

      if (parseEscape) {
        // The leading chars (!, <, =, >, ?) are private mode
        if (code === 33 || (code >= 60 && code <= 63)) {
          token.mode = char
        }
        // ';' separated digits are command args
        else if (code >= 48 && code <= 57) {
          token.currArg += char
        }
        // argument separator
        else if (code === 59) {
          if (token.currArg) {
            token.args.push(token.currArg)
            token.currArg = ''
          }
        }
        // (space), '!', '"', '#', '$', '%', '&', ''', '(', ')', '*', '+', ',', '-', '.', '/'
        // Are intermedaite modifiers
        else if (code >= 32 && code <= 47) {
          token.modifier = char
        }
        // The command itself
        else if (code >= 64 && code <= 126) {
          token.command = char
          parseEscape = false
        }
        // Illegal char within escape sequence
        else {
          // Render the whole sequence and let the browser handle the display
          const newToken = new Token()
          newToken.text = token.toString()
          token = newToken
          parseEscape = false
        }
      } else if (char === '\n') {
        // All new spans are to written to a new container. TODO: Use css to render empty div as empty line
        finalizeToken()
        finalizeToken(char)
      } else if (code === 27) {
        iter = readNextChar()

        if (!iter) {
          // Incomplete Escape sequence
          this[symbols.self].buffer = "\x1B"
          break
        } else if (iter.char === '[') {
          // Begin reading an ANSI escape sequence
          finalizeToken()
          parseEscape = true
        } else {
          // Unprintable character. The browser should print a special
          token.text += "\x1B" + char
        }
      } else {
        // Add char to current span data
        token.text += char
      }

      iter = readNextChar()
    }

    if (!token.isValid()) {
      // If the buffer was written above, the token should be empty
      this[symbols.self].buffer += token.toString()
    } else {
      finalizeToken()
    }
  }
}
