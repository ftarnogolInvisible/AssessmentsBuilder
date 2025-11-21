# Quick Test Checklist

## Before Testing

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start database:**
   ```bash
   npm run db:up
   ```

3. **Start server:**
   ```bash
   npm run dev
   ```

4. **Open browser:**
   ```
   http://localhost:3000/admin
   ```

## Test Scenarios

### Scenario 1: Multiple Choice Block
- [ ] Click "Multiple Choice" in sidebar
- [ ] Block appears in canvas
- [ ] Click settings icon
- [ ] Add 3 options: "Option A", "Option B", "Option C"
- [ ] Check checkbox next to "Option B" to mark as correct
- [ ] Verify "Option A" and "Option C" checkboxes uncheck automatically
- [ ] Save changes
- [ ] Verify block shows "✓ Correct answer marked"

### Scenario 2: Multi-Select Block
- [ ] Add "Multi-Select" block
- [ ] Add 4 options
- [ ] Check 2 options as correct
- [ ] Verify both stay checked
- [ ] Save and verify shows "✓ 2 correct answer(s) marked"

### Scenario 3: Free Text Block
- [ ] Add "Free Text" block
- [ ] Configure placeholder: "Enter your answer here..."
- [ ] Set min length: 10, max length: 500
- [ ] Save and verify

### Scenario 4: Drag and Drop
- [ ] Create 3 blocks
- [ ] Drag block 2 to position 1
- [ ] Verify order changes
- [ ] Drag block 3 to position 2
- [ ] Verify final order

### Scenario 5: Preview Mode
- [ ] Create assessment with:
  - 1 Multiple Choice block
  - 1 Multi-Select block  
  - 1 Free Text block
- [ ] Click "Preview" button
- [ ] Verify full-screen preview opens
- [ ] Answer multiple choice question
- [ ] Select multiple options in multi-select
- [ ] Type text in free text field
- [ ] Click "Next" to advance
- [ ] Verify progress bar updates
- [ ] Click "Previous" to go back
- [ ] Click "Submit Assessment" on last block
- [ ] Close preview

### Scenario 6: Media Stimulus
- [ ] Add "Media Stimulus" block
- [ ] Select "Image" as media type
- [ ] Upload an image file
- [ ] Verify preview appears
- [ ] Click "Remove media"
- [ ] Select "Video" as media type
- [ ] Upload a video file
- [ ] Verify video preview

### Scenario 7: Audio/Video Response
- [ ] Add "Audio Response" block
- [ ] Set min duration: 5s, max duration: 60s
- [ ] Upload PDF script (optional)
- [ ] Add "Video Response" block
- [ ] Set duration limits
- [ ] Note: Actual recording tested in preview mode

## Expected Results

✅ All blocks can be created and configured
✅ Correct answers can be marked
✅ Drag and drop reorders blocks
✅ Preview mode shows all blocks correctly
✅ Navigation works in preview
✅ All block types render properly

## Common Issues

**If blocks don't appear:**
- Check browser console (F12)
- Verify npm install completed
- Refresh page

**If drag doesn't work:**
- Check console for @dnd-kit errors
- Try clicking and holding the drag handle (grip icon)

**If preview doesn't open:**
- Make sure you have at least one block
- Check console for errors

**If recording doesn't work:**
- Check browser permissions
- Use Chrome/Edge for best support
- Must be on localhost or HTTPS

