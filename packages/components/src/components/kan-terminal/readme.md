# kan-terminal



<!-- Auto Generated Below -->


## Overview

A terminal window (KIT-008): a framed window on bg.inset with a title bar. Commands and output
go in the default slot, in the mono family. Long lines scroll inside the window, which can be
focused and scrolled with the keyboard, instead of widening the page.

## Properties

| Property  | Attribute | Description                       | Type     | Default      |
| --------- | --------- | --------------------------------- | -------- | ------------ |
| `heading` | `heading` | The window's title, like "~/ian". | `string` | `"terminal"` |


## Slots

| Slot | Description                                                   |
| ---- | ------------------------------------------------------------- |
|      | Commands and output, e.g. kan-prompt elements and pre blocks. |


## Shadow Parts

| Part         | Description         |
| ------------ | ------------------- |
| `"body"`     | The scrolling body. |
| `"title"`    | The title.          |
| `"titlebar"` | The title bar.      |
| `"window"`   | The window.         |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
