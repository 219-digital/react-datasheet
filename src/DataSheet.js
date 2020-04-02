import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import Sheet from './Sheet'
import Row from './Row'
import Cell from './Cell'
import DataCell from './DataCell'
import DataEditor from './DataEditor'
import ValueViewer from './ValueViewer'
import {
  TAB_KEY, ENTER_KEY, DELETE_KEY, ESCAPE_KEY, BACKSPACE_KEY,
  LEFT_KEY, UP_KEY, DOWN_KEY, RIGHT_KEY
} from './keys'

const isEmpty = (obj) => Object.keys(obj).length === 0

const range = (start, end) => {
  const array = []
  const inc = (end - start > 0)
  for (let i = start; inc ? (i <= end) : (i >= end); inc ? i++ : i--) {
    inc ? array.push(i) : array.unshift(i)
  }
  return array
}

const defaultParsePaste = (str) => {
  return str.split(/\r\n|\n|\r/)
    .map((row) => row.split('\t'))
}

export default class DataSheet extends PureComponent {
  constructor (props) {
    super(props)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.onMouseOver = this.onMouseOver.bind(this)
    this.onDoubleClick = this.onDoubleClick.bind(this)
    this.onContextMenu = this.onContextMenu.bind(this)
    this.handleNavigate = this.handleNavigate.bind(this)
    this.handleEdit = this.handleEdit.bind(this)
    this.handleKey = this.handleKey.bind(this).bind(this)
    this.handleCut = this.handleCut.bind(this)
    this.handleCopy = this.handleCopy.bind(this)
    this.handlePaste = this.handlePaste.bind(this)
    this.pageClick = this.pageClick.bind(this)
    this.onChange = this.onChange.bind(this)
    this.onRevert = this.onRevert.bind(this)
    this.isSelected = this.isSelected.bind(this)
    this.isEditing = this.isEditing.bind(this)
    this.isClearing = this.isClearing.bind(this)
    this.handleComponentKey = this.handleComponentKey.bind(this)

    this.handleKeyboardCellMovement = this.handleKeyboardCellMovement.bind(this)

    this.defaultState = {
      start: {},
      end: {},
      selecting: false,
      copydownDragging: false,
      copydownTarget: {},
      forceEdit: false,
      editing: {},
      clear: {}
    }
    this.state = this.defaultState

    this.removeAllListeners = this.removeAllListeners.bind(this)
  }

  removeAllListeners () {
    document.removeEventListener('mousedown', this.pageClick)
    document.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('cut', this.handleCut)
    document.removeEventListener('copy', this.handleCopy)
    document.removeEventListener('paste', this.handlePaste)
    document.removeEventListener('keydown', this.handlePaste)
  }

  componentDidMount () {
    // Add listener scoped to the DataSheet that catches otherwise unhandled
    // keyboard events when displaying components
    this.dgDom && this.dgDom.addEventListener('keydown', this.handleComponentKey)
  }

  componentWillUnmount () {
    this.dgDom && this.dgDom.removeEventListener('keydown', this.handleComponentKey)
    this.removeAllListeners()
  }

  isSelectionControlled () {
    return ('selected' in this.props)
  }

  getState () {
    let state = this.state
    if (this.isSelectionControlled()) {
      let { start, end } = this.props.selected || {}
      start = start || this.defaultState.start
      end = end || this.defaultState.end
      state = { ...state, start, end }
    }
    return state
  }

  _setState (state) {
    if (this.isSelectionControlled() && (('start' in state) || ('end' in state))) {
      let { start, end, ...rest } = state
      let { selected, onSelect } = this.props
      selected = selected || {}
      if (!start) {
        start = 'start' in selected ? selected.start : this.defaultState.start
      }
      if (!end) {
        end = 'end' in selected ? selected.end : this.defaultState.end
      }
      onSelect && onSelect({ start, end })
      this.setState(rest)
    } else {
      this.setState(state)
    }
  }

  pageClick (e) {
    const element = this.dgDom
    if (!element.contains(e.target)) {
      this.setState(this.defaultState)
      this.removeAllListeners()
    }
  }

  handleCut (e) {
    if (isEmpty(this.state.editing)) {
      e.preventDefault()
      this.handleCopy(e)
      const { start, end } = this.getState()
      this.clearSelectedCells(start, end)
    }
  }

  handleCopy (e) {
    if (isEmpty(this.state.editing)) {
      e.preventDefault()
      const { dataRenderer, valueRenderer, data } = this.props
      const { start, end } = this.getState()

      const text = range(start.i, end.i).map((i) =>
        range(start.j, end.j).map(j => {
          const cell = data[i][j]
          const value = dataRenderer ? dataRenderer(cell, i, j) : null
          if (value === '' || value === null || typeof (value) === 'undefined') {
            return valueRenderer(cell, i, j)
          }
          return value
        }).join('\t')
      ).join('\n')
      e.clipboardData.setData('text/plain', text)
    }
  }

  handlePaste (e) {
    if (isEmpty(this.state.editing)) {
      let { start, end } = this.getState()

      start = { i: Math.min(start.i, end.i), j: Math.min(start.j, end.j) }
      end = { i: Math.max(start.i, end.i), j: Math.max(start.j, end.j) }

      const parse = this.props.parsePaste || defaultParsePaste
      const changes = []
      let pasteData = []
      if (window.clipboardData && window.clipboardData.getData) { // IE
        pasteData = parse(window.clipboardData.getData('Text'))
      } else if (e.clipboardData && e.clipboardData.getData) {
        pasteData = parse(e.clipboardData.getData('text/plain'))
      }

      // in order of preference
      const { data, onCellsChanged, onPaste, onChange } = this.props
      if (onCellsChanged) {
        const additions = []
        pasteData.forEach((row, i) => {
          row.forEach((value, j) => {
            end = { i: start.i + i, j: start.j + j }
            const cell = data[end.i] && data[end.i][end.j]
            if (!cell) {
              additions.push({ row: end.i, col: end.j, value })
            } else if (!cell.readOnly) {
              changes.push({ cell, row: end.i, col: end.j, value })
            }
          })
        })
        if (additions.length) {
          onCellsChanged(changes, additions)
        } else {
          onCellsChanged(changes)
        }
      } else if (onPaste) {
        pasteData.forEach((row, i) => {
          const rowData = []
          row.forEach((pastedData, j) => {
            end = { i: start.i + i, j: start.j + j }
            const cell = data[end.i] && data[end.i][end.j]
            rowData.push({ cell: cell, data: pastedData })
          })
          changes.push(rowData)
        })
        onPaste(changes)
      } else if (onChange) {
        pasteData.forEach((row, i) => {
          row.forEach((value, j) => {
            end = { i: start.i + i, j: start.j + j }
            const cell = data[end.i] && data[end.i][end.j]
            if (cell && !cell.readOnly) {
              onChange(cell, end.i, end.j, value)
            }
          })
        })
      }
      this._setState({ end })
    }
  }

  handleKeyboardCellMovement (e, commit = false) {
    const { start, editing } = this.getState()
    const { data } = this.props
    const isEditing = editing && !isEmpty(editing)
    const currentCell = data[start.i] && data[start.i][start.j]

    if (isEditing && !commit) {
      return false
    }
    const hasComponent = currentCell && currentCell.component

    const keyCode = e.which || e.keyCode

    if (hasComponent && (isEditing)) {
      e.preventDefault()
      return
    }

    if (keyCode === TAB_KEY) {
      this.handleNavigate(e, { i: 0, j: e.shiftKey ? -1 : 1 }, true)
    } else if (keyCode === RIGHT_KEY) {
      this.handleNavigate(e, { i: 0, j: 1 })
    } else if (keyCode === LEFT_KEY) {
      this.handleNavigate(e, { i: 0, j: -1 })
    } else if (keyCode === UP_KEY) {
      this.handleNavigate(e, { i: -1, j: 0 })
    } else if (keyCode === DOWN_KEY) {
      this.handleNavigate(e, { i: 1, j: 0 })
    } else if (commit && keyCode === ENTER_KEY) {
      this.handleNavigate(e, { i: e.shiftKey ? -1 : 1, j: 0 }, true)
    }
  }

  handleEdit (value) {
    this.setState({ editValue: value })
  }

  handleKey (e) {
    if (e.isPropagationStopped && e.isPropagationStopped()) {
      return
    }
    const keyCode = e.which || e.keyCode
    const { start, end, editing } = this.getState()
    const isEditing = editing && !isEmpty(editing)
    const noCellsSelected = !start || isEmpty(start)
    const ctrlKeyPressed = e.ctrlKey || e.metaKey
    const deleteKeysPressed = (keyCode === DELETE_KEY || keyCode === BACKSPACE_KEY)
    const enterKeyPressed = keyCode === ENTER_KEY
    const numbersPressed = (keyCode >= 48 && keyCode <= 57)
    const lettersPressed = (keyCode >= 65 && keyCode <= 90)
    const latin1Supplement = (keyCode >= 160 && keyCode <= 255)
    const numPadKeysPressed = (keyCode >= 96 && keyCode <= 105)
    const currentCell = !noCellsSelected && this.props.data[start.i][start.j]
    const equationKeysPressed = [
      187, /* equal */
      189, /* substract */
      190, /* period */
      107, /* add */
      109, /* decimal point */
      110
    ].indexOf(keyCode) > -1

    if (noCellsSelected || ctrlKeyPressed) {
      return true
    }

    if (!isEditing) {
      this.handleKeyboardCellMovement(e)
      if (deleteKeysPressed) {
        e.preventDefault()
        this.clearSelectedCells(start, end)
      } else if (currentCell && !currentCell.readOnly) {
        if (enterKeyPressed) {
          this._setState({ editing: start, clear: {}, forceEdit: true })
          e.preventDefault()
        } else if (numbersPressed ||
          numPadKeysPressed ||
          lettersPressed ||
          latin1Supplement ||
          equationKeysPressed) {
          // empty out cell if user starts typing without pressing enter
          this._setState({ editing: start, clear: start, forceEdit: false })
        }
      }
    }
  }

  getSelectedCells (data, start, end) {
    const selected = []
    range(start.i, end.i).map(row => {
      range(start.j, end.j).map(col => {
        if (data[row] && data[row][col]) {
          selected.push({ cell: data[row][col], row, col })
        }
      })
    })
    return selected
  }

  clearSelectedCells (start, end) {
    const { data, onCellsChanged, onChange } = this.props
    const cells = this.getSelectedCells(data, start, end)
      .filter(cell => !cell.cell.readOnly)
      .map(cell => ({ ...cell, value: '' }))
    if (onCellsChanged) {
      onCellsChanged(cells)
      this.onRevert()
    } else if (onChange) {
      // ugly solution brought to you by https://reactjs.org/docs/react-component.html#setstate
      // setState in a loop is unreliable
      setTimeout(() => {
        cells.forEach(({ cell, row, col, value }) => {
          onChange(cell, row, col, value)
        })
        this.onRevert()
      }, 0)
    }
  }

  updateLocationSingleCell (location) {
    this._setState({
      start: location,
      end: location,
      editing: {}
    })
  }

  updateLocationMultipleCells (offsets) {
    const { start, end } = this.getState()
    const { data } = this.props
    const oldStartLocation = { i: start.i, j: start.j }
    const newEndLocation = { i: end.i + offsets.i, j: Math.min(data[0].length - 1, Math.max(0, end.j + offsets.j)) }
    this._setState({
      start: oldStartLocation,
      end: newEndLocation,
      editing: {}
    })
  }

  searchForNextSelectablePos (isCellNavigable, data, start, offsets, jumpRow) {
    const previousRow = (location) => ({ i: location.i - 1, j: data[0].length - 1 })
    const nextRow = (location) => ({ i: location.i + 1, j: 0 })
    const advanceOffset = (location) => ({ i: location.i + offsets.i, j: location.j + offsets.j })
    const isCellDefined = ({ i, j }) => data[i] && typeof (data[i][j]) !== 'undefined'

    let newLocation = advanceOffset(start)

    while (
      isCellDefined(newLocation) &&
      !isCellNavigable(data[newLocation.i][newLocation.j], newLocation.i, newLocation.j)
    ) {
      newLocation = advanceOffset(newLocation)
    }

    if (!isCellDefined(newLocation)) {
      if (!jumpRow) {
        return null
      }
      if (offsets.j < 0) {
        newLocation = previousRow(newLocation)
      } else {
        newLocation = nextRow(newLocation)
      }
    }

    if (
      isCellDefined(newLocation) &&
      !isCellNavigable(data[newLocation.i][newLocation.j], newLocation.i, newLocation.j)) {
      return this.searchForNextSelectablePos(isCellNavigable, data, newLocation, offsets, jumpRow)
    } else if (isCellDefined(newLocation)) {
      return newLocation
    } else {
      return null
    }
  }

  handleNavigate (e, offsets, jumpRow) {
    if (offsets && (offsets.i || offsets.j)) {
      const { data } = this.props
      const { start } = this.getState()

      const multiSelect = e.shiftKey && !jumpRow
      const isCellNavigable = this.props.isCellNavigable ? this.props.isCellNavigable : () => true

      if (multiSelect) {
        this.updateLocationMultipleCells(offsets)
      } else {
        const newLocation = this.searchForNextSelectablePos(isCellNavigable, data, start, offsets, jumpRow)
        if (newLocation) {
          this.updateLocationSingleCell(newLocation)
        }
      }
    }
  }

  handleComponentKey (e) {
    // handles keyboard events when editing components
    const keyCode = e.which || e.keyCode
    if (![ENTER_KEY, ESCAPE_KEY, TAB_KEY].includes(keyCode)) {
      return
    }
    const { editing } = this.state
    const { data } = this.props
    const isEditing = !isEmpty(editing)
    if (isEditing) {
      const currentCell = data[editing.i][editing.j]
      const offset = e.shiftKey ? -1 : 1
      if (currentCell && currentCell.component && !currentCell.forceComponent) {
        e.preventDefault()
        let func = this.onRevert // ESCAPE_KEY
        if (keyCode === ENTER_KEY) {
          func = () => this.handleNavigate(e, { i: offset, j: 0 }, true)
        } else if (keyCode === TAB_KEY) {
          func = () => this.handleNavigate(e, { i: 0, j: offset }, true)
        }
        // setTimeout makes sure that component is done handling the event before we take over
        setTimeout(() => { func(); this.dgDom && this.dgDom.focus() }, 1)
      }
    }
  }

  onContextMenu (evt, i, j) {
    const cell = this.props.data[i][j]
    if (this.props.onContextMenu) {
      this.props.onContextMenu(evt, cell, i, j)
    }
  }

  onDoubleClick (i, j) {
    const cell = this.props.data[i][j]
    if (!cell.readOnly) {
      this._setState({ editing: { i: i, j: j }, forceEdit: true, clear: {} })
    }
  }

  onMouseDown (i, j, e) {
    const isNowEditingSameCell = !isEmpty(this.state.editing) && this.state.editing.i === i && this.state.editing.j === j
    const editing = (isEmpty(this.state.editing) || this.state.editing.i !== i || this.state.editing.j !== j)
      ? {} : this.state.editing

    this._setState({
      selecting: !isNowEditingSameCell && !e.fromCopydownHandle,
      copydownDragging: e.fromCopydownHandle,
      start: e.shiftKey | e.fromCopydownHandle ? this.state.start : { i, j },
      end: e.fromCopydownHandle ? this.state.end : { i, j },
      editing: editing,
      forceEdit: !!isNowEditingSameCell
    })

    var ua = window.navigator.userAgent
    var isIE = /MSIE|Trident/.test(ua)
    // Listen for Ctrl + V in case of IE
    if (isIE) {
      document.addEventListener('keydown', (e) => {
        if ((e.keyCode === 86 || e.which === 86) && e.ctrlKey) {
          this.handlePaste(e)
        }
      })
    }

    // Keep listening to mouse if user releases the mouse (dragging outside)
    document.addEventListener('mouseup', this.onMouseUp)
    // Listen for any outside mouse clicks
    document.addEventListener('mousedown', this.pageClick)

    // Cut, copy and paste event handlers
    document.addEventListener('cut', this.handleCut)
    document.addEventListener('copy', this.handleCopy)
    document.addEventListener('paste', this.handlePaste)
  }

  onMouseOver (i, j) {
    const { start, end } = this.state
    function calculateCopydownTarget(coords) {
      const {i, j} = coords
      // Establish selection bounds
      const smallestI = Math.min(start.i, end.i)
      const largestI = Math.max(start.i, end.i)
      const smallestJ = Math.min(start.j, end.j)
      const largestJ = Math.max(start.j, end.j)
      
      const iWithinSelection = (i >= smallestI) && (i <= largestI)
      const jWithinSelection = (j >= smallestJ) && (j <= largestJ)

      // If dragging within selection, target is {}
      if (iWithinSelection && jWithinSelection) return {}
      
      // Otherwise get the delta...
      const deltaI = (i < smallestI) ? (i - smallestI) : (i - largestI)
      const deltaJ = (j < smallestJ) ? (j - smallestJ) : (j - largestJ)
      
      if (iWithinSelection) return { j: deltaJ }
      if (jWithinSelection) return { i: deltaI }
      else {
        const target = Math.abs(deltaI) >= Math.abs(deltaJ) ? { i: deltaI } : { j: deltaJ}
        return target
      }
    }
    
    if (this.state.selecting && isEmpty(this.state.editing)) {
      this._setState({ end: { i, j } })
    }

    if (this.state.copydownDragging) {
      // Update the copydownTarget state
      const target = calculateCopydownTarget({i, j})
      this._setState({ copydownTarget: target })
    }
  }

  onMouseUp () {
    const { copydownDragging, copydownTarget, start } = this.state
    const { data, onCellsChanged } = this.props
    
    // If copydown in progress, paste in the selection
    // Currently only supports pasting of a single cell, needs a rewrite to support multi-cell copydown
    if(copydownDragging && !isEmpty(copydownTarget)) {
      // Make array with coords and values
      const changes = []

      // Vertical or horizontal copydown
      const isVertical = !!copydownTarget.i
      const extendedSide = isVertical ? 'row' : 'col'
      const constantSide = isVertical ? 'col' : 'row'
      const constantCoord = isVertical ? start.j : start.i
      const changeTemplate = {}
      changeTemplate[constantSide] = constantCoord
      changeTemplate.value = data[start.i][start.j].value

      // Number of rows/cols copied into
      const offset = copydownTarget.i | copydownTarget.j

      // Coordinates of first and last col
      const startingPoint = isVertical ? offset > 0 ? start.i + 1 : start.i + offset
        : offset > 0 ? start.j + 1 : start.j + offset 
      const max = isVertical ? offset > 0 ? start.i + offset : start.i - 1
      : offset > 0 ? start.j + offset : start.j - 1

      for (let x = startingPoint; x <= max; x++) {
        const change = {...changeTemplate}
        change[extendedSide] = x
        change.cell = isVertical ? data[x][constantCoord] : data[constantCoord][x]
        if (!data[change.row][change.col].readOnly) changes.push(change)
      }

      // Apply the changes
      if (changes.length) onCellsChanged(changes)
    }
    this._setState({ selecting: false, copydownDragging: false, copydownTarget: {} })
    document.removeEventListener('mouseup', this.onMouseUp)
  }

  onChange (row, col, value) {
    const { onChange, onCellsChanged, data } = this.props
    if (onCellsChanged) {
      onCellsChanged([{ cell: data[row][col], row, col, value }])
    } else if (onChange) {
      onChange(data[row][col], row, col, value)
    }
    this.onRevert()
  }

  onRevert () {
    this._setState({ editing: {} })
    this.dgDom && this.dgDom.focus()
  }

  componentDidUpdate (prevProps, prevState) {
    const { start, end } = this.state
    const prevEnd = prevState.end
    if (!isEmpty(end) && !(end.i === prevEnd.i && end.j === prevEnd.j) && !this.isSelectionControlled()) {
      this.props.onSelect && this.props.onSelect({ start, end })
    }
  }

  isSelected (i, j) {
    const { start, end } = this.getState()
    const posX = (j >= start.j && j <= end.j)
    const negX = (j <= start.j && j >= end.j)
    const posY = (i >= start.i && i <= end.i)
    const negY = (i <= start.i && i >= end.i)

    return (posX && posY) ||
      (negX && posY) ||
      (negX && negY) ||
      (posX && negY)
  }

  isBottomRightSelected (i, j) {
    const { start, end } = this.getState()
    const largestI = start.i > end.i ? start.i : end.i
    const largestJ = start.j > end.j ? start.j : end.j
    return i === largestI && j === largestJ
  }
  
  isSingleSelected (i, j) {
    const { start, end } = this.getState()
    return i === start.i && i === end.i && j === start.j && j === end.j
  }

  isCopydownTargeted (i, j) {
    const { copydownTarget: target, start, end } = this.state

    if (isEmpty(target)) return false

    // Establish selection bounds
    const smallestI = Math.min(start.i, end.i)
    const largestI = Math.max(start.i, end.i)
    const smallestJ = Math.min(start.j, end.j)
    const largestJ = Math.max(start.j, end.j)

    if (target.i) {
      // Within selection j and in target i return true
      const jWithinSelection = (j >= smallestJ) && (j <= largestJ)
      const iWithinTarget = target.i > 0 ? (i > largestI) && (i <= largestI + target.i) : (i < smallestI) && (i >= smallestI + target.i)

      return jWithinSelection && iWithinTarget
    }
    else if (target.j) {
      // Within selection i and in target j return true
      const iWithinSelection = (i >= smallestI) && (i <= largestI)
      const jWithinTarget = target.j > 0 ? (j > largestJ) && (j <= largestJ + target.j) : (j < smallestJ) && (j >= smallestJ + target.j)
  
      return iWithinSelection && jWithinTarget
    }
  }

  isEditing (i, j) {
    return this.state.editing.i === i && this.state.editing.j === j
  }

  isClearing (i, j) {
    return this.state.clear.i === i && this.state.clear.j === j
  }

  render () {
    const {
      sheetRenderer: SheetRenderer, rowRenderer: RowRenderer, cellRenderer,
      dataRenderer, valueRenderer, dataEditor, valueViewer, attributesRenderer,
      className, overflow, data, keyFn
    } = this.props
    const { forceEdit, selecting, copydownDragging } = this.state

    return (
      <span ref={r => { this.dgDom = r }} tabIndex='0' className='data-grid-container' onKeyDown={this.handleKey}>
        <SheetRenderer data={data} className={['data-grid', className, overflow].filter(a => a).join(' ')}>
          {data.map((row, i) =>
            <RowRenderer key={keyFn ? keyFn(i) : i} row={i} cells={row}>
              {
                row.map((cell, j) => {
                  const isEditing = this.isEditing(i, j)
                  return (
                    <DataCell
                      key={cell.key ? cell.key : `${i}-${j}`}
                      row={i}
                      col={j}
                      cell={cell}
                      forceEdit={forceEdit}
                      onMouseDown={this.onMouseDown}
                      onMouseOver={this.onMouseOver}
                      onDoubleClick={this.onDoubleClick}
                      onContextMenu={this.onContextMenu}
                      onChange={this.onChange}
                      onRevert={this.onRevert}
                      onNavigate={this.handleKeyboardCellMovement}
                      onKey={this.handleKey}
                      selected={this.isSelected(i, j)}
                      copydownTargeted={this.isCopydownTargeted(i, j)}
                      selecting={selecting}
                      copydownDragging={copydownDragging}
                      lastSelected={this.isSingleSelected(i, j)} // Replace with isBottomRightSelected to enable multicell copydown
                      editing={isEditing}
                      clearing={this.isClearing(i, j)}
                      attributesRenderer={attributesRenderer}
                      cellRenderer={cellRenderer}
                      valueRenderer={valueRenderer}
                      dataRenderer={dataRenderer}
                      valueViewer={valueViewer}
                      dataEditor={dataEditor}
                      editValue={this.state.editValue}
                      {... isEditing ? {
                        onEdit: this.handleEdit
                      }
                        : {}
                      }
                    />
                  )
                })
              }
            </RowRenderer>)}
        </SheetRenderer>
      </span>
    )
  }
}

DataSheet.propTypes = {
  data: PropTypes.array.isRequired,
  className: PropTypes.string,
  overflow: PropTypes.oneOf(['wrap', 'nowrap', 'clip']),
  onChange: PropTypes.func,
  onCellsChanged: PropTypes.func,
  onContextMenu: PropTypes.func,
  onSelect: PropTypes.func,
  isCellNavigable: PropTypes.func,
  selected: PropTypes.shape({
    start: PropTypes.shape({
      i: PropTypes.number,
      j: PropTypes.number
    }),
    end: PropTypes.shape({
      i: PropTypes.number,
      j: PropTypes.number
    })
  }),
  valueRenderer: PropTypes.func.isRequired,
  dataRenderer: PropTypes.func,
  sheetRenderer: PropTypes.func.isRequired,
  rowRenderer: PropTypes.func.isRequired,
  cellRenderer: PropTypes.func.isRequired,
  valueViewer: PropTypes.func,
  dataEditor: PropTypes.func,
  parsePaste: PropTypes.func,
  attributesRenderer: PropTypes.func,
  keyFn: PropTypes.func
}

DataSheet.defaultProps = {
  sheetRenderer: Sheet,
  rowRenderer: Row,
  cellRenderer: Cell,
  valueViewer: ValueViewer,
  dataEditor: DataEditor
}
