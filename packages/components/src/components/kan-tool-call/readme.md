# kan-tool-call



<!-- Auto Generated Below -->


## Overview

A tool call the way an agent session shows it (KIT-013):

    ● Read(profile)
      ⎿ Software Engineer

Put details in the default slot and the call line becomes a button that shows and hides them.

## Properties

| Property | Attribute | Description                                             | Type                                | Default     |
| -------- | --------- | ------------------------------------------------------- | ----------------------------------- | ----------- |
| `arg`    | `arg`     | A short argument, like "profile".                       | `string \| undefined`               | `undefined` |
| `name`   | `name`    | The tool's name, like "Read".                           | `string`                            | `""`        |
| `open`   | `open`    | Whether the details are shown.                          | `boolean`                           | `false`     |
| `status` | `status`  | Whether the call is still running, succeeded or failed. | `"error" \| "pending" \| "success"` | `"success"` |


## Events

| Event       | Description                                                                 | Type                              |
| ----------- | --------------------------------------------------------------------------- | --------------------------------- |
| `kanToggle` | Fires when the details are shown or hidden. `detail.open` is the new state. | `CustomEvent<{ open: boolean; }>` |


## Slots

| Slot       | Description                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
|            | Details, shown when the call is open. Leave it empty for a call without details. |
| `"result"` | The one-line result.                                                             |


## Shadow Parts

| Part        | Description                                     |
| ----------- | ----------------------------------------------- |
| `"call"`    | The call line; a button when there are details. |
| `"details"` | The details.                                    |
| `"glyph"`   | The status glyph.                               |
| `"result"`  | The result line.                                |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
