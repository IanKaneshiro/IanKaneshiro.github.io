# kan-prompt



<!-- Auto Generated Below -->


## Overview

A prompt line, like the start of an agent session (KIT-007). The text is ordinary page content,
so it's in the HTML before JavaScript runs and screen readers read it once. The cursor is
decoration, and it stops blinking when the visitor prefers reduced motion.

## Properties

| Property | Attribute | Description                                                            | Type      | Default |
| -------- | --------- | ---------------------------------------------------------------------- | --------- | ------- |
| `cursor` | `cursor`  | Shows a blinking cursor after the text. Set cursor="false" to hide it. | `boolean` | `true`  |
| `glyph`  | `glyph`   | The glyph before the text.                                             | `string`  | `">"`   |


## Slots

| Slot | Description        |
| ---- | ------------------ |
|      | The prompt's text. |


## Shadow Parts

| Part       | Description       |
| ---------- | ----------------- |
| `"cursor"` | The cursor.       |
| `"glyph"`  | The prompt glyph. |
| `"text"`   | The text.         |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
