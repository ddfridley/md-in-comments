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

/*
### Testing New Features

#### Header Level 4
##### Header Level 5
###### Header Level 6
####### Header Level 7

**Links:**
- Check out [VS Code Documentation](https://code.visualstudio.com)
- Visit [GitHub](https://github.com) for more info
- Read the [Markdown Guide](https://www.markdownguide.org)

**Images:**
- Logo: ![Company Logo](https://example.com/logo.png)
- Screenshot: ![App Screenshot](./images/screenshot.png)
- Icon: ![Settings Icon](icons/settings.svg)

**Task Lists:**
- [ ] Incomplete task
- [x] Completed task
- [ ] Another pending task
- [X] Another completed task (uppercase X)
- [ ] Task with **bold** text
- [x] Task with *italic* text

**Combined Features:**
- [x] Completed task with [link](https://example.com)
- [ ] Pending task with `code`
- [ ] Task with ![image alt](url.png) embedded
- [ ] Task with ![image alt](url.png) embedded

*/

function testNewFeatures() {
    // Test Ctrl+Alt+M to toggle markdown rendering on/off
    console.log("Toggle test");
}
