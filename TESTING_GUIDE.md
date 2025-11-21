# Testing Guide - Assessment Builder

## Quick Start Testing

### 1. Install Dependencies
```bash
cd /Users/ftarnogol/AssessmentsBuilder/AssessmentBuilder
npm install
```

This will install the new drag-and-drop libraries (@dnd-kit) and other dependencies.

### 2. Start Database (if not running)
```bash
npm run db:up
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Open in Browser
Navigate to: `http://localhost:3000/admin` (or your configured port)

## What to Test

### ✅ Block Creation
1. **Multiple Choice**
   - Click "Multiple Choice" in sidebar
   - Click the settings icon on the block
   - Add 3-4 options
   - Mark one as correct (checkbox)
   - Verify only one can be marked correct

2. **Multi-Select**
   - Add a Multi-Select block
   - Add options
   - Mark multiple as correct
   - Verify multiple checkboxes can be checked

3. **Free Text**
   - Add Free Text block
   - Configure placeholder text
   - Set min/max length
   - Save and verify

4. **Audio Response**
   - Add Audio Response block
   - Configure min/max duration
   - Upload PDF script (optional)
   - Note: Recording will work in preview mode

5. **Video Response**
   - Add Video Response block
   - Configure duration limits
   - Note: Recording will work in preview mode

6. **Media Stimulus**
   - Add Media Stimulus block
   - Select media type (image/video/audio)
   - Upload a file
   - Verify preview appears
   - Test removing media

### ✅ Drag and Drop
1. Create multiple blocks
2. Drag blocks to reorder them
3. Verify order updates visually

### ✅ Preview Mode
1. Create an assessment with multiple block types
2. Click "Preview" button
3. Test navigation (Previous/Next)
4. Test each block type:
   - Answer multiple choice questions
   - Select multiple options in multi-select
   - Type in free text field
   - Test audio recording (if browser supports)
   - Test video recording (if browser supports)
   - View media stimulus
5. Verify progress bar updates
6. Test time limits (if configured)
7. Click "Submit Assessment" on last block

### ✅ Block Configuration
1. Click settings icon on any block
2. Change title, instructions
3. Toggle required flag
4. Set time limit
5. Configure block-specific settings
6. Save and verify changes persist

## Expected Behavior

- ✅ Blocks appear immediately when added
- ✅ Drag handle works for reordering
- ✅ Configuration modal opens/closes smoothly
- ✅ Changes save when clicking "Save Changes"
- ✅ Preview mode shows all blocks correctly
- ✅ Navigation works in preview
- ✅ All block types render properly

## Troubleshooting

### Blocks not appearing
- Check browser console for errors
- Verify @dnd-kit packages installed
- Check that blocks array is updating

### Drag and drop not working
- Check browser console for errors
- Verify @dnd-kit/core and @dnd-kit/sortable installed
- Try refreshing the page

### Preview mode not opening
- Check browser console for errors
- Verify you have at least one block
- Check PreviewMode component imports

### Recording not working
- Check browser permissions (camera/microphone)
- Use HTTPS or localhost (required for media access)
- Check browser console for permission errors

## Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (may have limitations)
- ⚠️ Media recording requires HTTPS or localhost

## Next Steps After Testing

Once testing is complete, we'll:
1. Connect to API for persistence
2. Implement file uploads
3. Add publish functionality
4. Complete Phase 2

