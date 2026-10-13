import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHeaderSlot } from '../../app/headerSlot.ts'
import type { NodeRef } from '../orbit/orbitLayout.ts'
import type { GraphViewKind } from '../orbit/useView.ts'
import type { Workspace } from './workspaceModel.ts'

interface FindOption {
  key: string
  ref: NodeRef
  label: string
  /** What else the filter looks in: the artist of a song. */
  hint: string
  group: 'Songs' | 'People'
}

const filter = createFilterOptions<FindOption>({ limit: 30, stringify: (option) => `${option.label} ${option.hint}` })

function optionsOf(workspace: Workspace): FindOption[] {
  return [
    ...workspace.songs.map(
      (song): FindOption => ({
        key: `song:${song.mbid}`,
        ref: { type: 'song', id: song.mbid },
        label: song.title,
        hint: song.artist,
        group: 'Songs',
      }),
    ),
    ...workspace.people.map(
      (person): FindOption => ({
        key: `person:${person.mbid}`,
        ref: { type: 'person', id: person.mbid },
        label: person.name,
        hint: '',
        group: 'People',
      }),
    ),
  ]
}

interface GraphToolsProps {
  workspace: Workspace
  view: GraphViewKind
  onView: (view: GraphViewKind) => void
  /** A song or a person was found: the orbit is centred on it (FR-GRAPH-05). */
  onFind: (ref: NodeRef) => void
}

/**
 * "Find in your graph" and the Orbit / Constellation toggle (FR-GRAPH-05, FR-VIEW-02), rendered into the app bar
 * through a portal. Finding is a combobox over the songs and the people who are in the graph right now (so a hidden
 * person or a removed song is not offered), at most thirty matches at a time so 700 people stay fast.
 */
export function GraphTools({ workspace, view, onView, onFind }: GraphToolsProps) {
  const slot = useHeaderSlot()
  const options = useMemo(() => optionsOf(workspace), [workspace])
  const [text, setText] = useState('')

  if (slot === null) return null

  return createPortal(
    <>
      <Autocomplete<FindOption, false, false, false>
        options={options}
        value={null}
        inputValue={text}
        onInputChange={(_, value, reason) => {
          // Choosing an option resets the text; the box is cleared for the next search instead of keeping the name.
          if (reason === 'input' || reason === 'clear') setText(value)
        }}
        onChange={(_, option) => {
          if (option === null) return
          setText('')
          onFind(option.ref)
        }}
        groupBy={(option) => option.group}
        getOptionLabel={(option) => option.label}
        getOptionKey={(option) => option.key}
        filterOptions={filter}
        noOptionsText="Nothing in your graph matches"
        clearOnBlur
        blurOnSelect
        size="small"
        sx={{ flex: '1 1 220px', maxWidth: 420, minWidth: 0, order: { xs: 4, sm: 0 } }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Find in your graph"
            slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, 'aria-label': 'Find in your graph' } }}
          />
        )}
        renderOption={(props, option) => {
          const { key, ...rest } = props
          return (
            <Box component="li" key={key} {...rest}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {option.label}
              </Box>
              {option.hint !== '' && (
                <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: 13 }}>
                  {option.hint}
                </Box>
              )}
            </Box>
          )
        }}
      />

      <ToggleButtonGroup
        exclusive
        size="small"
        value={view}
        onChange={(_, next: GraphViewKind | null) => {
          // An exclusive group reports null when the pressed one is pressed again; the view stays.
          if (next !== null) onView(next)
        }}
        aria-label="View"
        sx={{ order: { xs: 4, sm: 0 } }}
      >
        <ToggleButton value="orbit">Orbit</ToggleButton>
        <ToggleButton value="constellation">Constellation</ToggleButton>
      </ToggleButtonGroup>
    </>,
    slot,
  )
}
