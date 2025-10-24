// Single-line comments should have LIMITED formatting (no headers!)
// This is **bold text** and this is *italic text*
// Here is some `inline code` for testing
// ~~This should be strikethrough~~

/* 
# Multi-line Header
## Header Level 2
### Header Level 3
This is **bold** in a multi-line comment
Testing *italic* and `code` here too
## Header with **bold** text in the line

### List Examples

**Unordered Lists:**
- First bullet item
- Second bullet item with **bold**
- Third item with *italic*
  - Nested bullet (indented)
  - Another nested item

**Ordered Lists:**
1. First numbered item
2. Second item with `code`
3. Third item with ~~strikethrough~~
   1. Nested numbered item
   2. Another nested number

   
**Mixed content:**
- Bullet with **bold** and *italic*
- Another bullet
1. Mixed with numbered
2. Another number

**Code Block Example**
```javascript
window.socket.emit('get-dem-info', ['id1', 'id2'], (result) => {
  if (result) {
    // Success: { id1: { stateOfResidence: 'CA', ... }, id2: null }
  } else {
    // Error: undefined
  }
})
```
*/

function testFunction() {
    // Single-line with **bold** text (no header support!)
    // Regular comment with *emphasis*
    console.log("Testing markdown in comments");  // Trailing comment with **bold** formatting
    const x = 5;  // Another trailing comment with `code` and *italic*
}

/*****
 * comment block with  ` *` at the beginning
* this comment has `*` at the beginning 
 * 
* 
 ****/
