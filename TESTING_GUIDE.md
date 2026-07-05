# Feature Testing Guide

## Testing Dark Mode

### Manual Test Steps:
1. **Start the app**: `npm run dev`
2. **Click the moon/sun icon** in the top navbar (next to notifications)
3. **Expected behavior**:
   - Light mode → Shows moon icon 🌙
   - Dark mode → Shows sun icon ☀️
   - Background should change from cream (#f3f0e9) to dark gray
   - All text should invert colors
   - Theme persists after page refresh

### Test in Settings Page:
1. Go to `/settings`
2. Click "Appearance" tab
3. Click "Dark" or "Light" button
4. Theme should change immediately
5. No "Coming Soon" label should appear

### Troubleshooting:
- Clear localStorage: `localStorage.clear()` in console
- Check console for errors
- Verify `document.documentElement.classList` contains 'dark' class in dark mode

---

## Testing Keyboard Shortcuts

### Manual Test Steps:
1. **Start the app**: `npm run dev`
2. **Login** to access dashboard
3. **Press `?`** (question mark key)
   - Should show keyboard shortcuts modal
   - Modal should display all available shortcuts
4. **Test navigation shortcuts**:
   - Press `g` then `d` → Go to Dashboard
   - Press `g` then `t` → Go to Vision Tests
   - Press `g` then `r` → Go to Trends
   - Press `g` then `l` → Go to Lifestyle
   - Press `g` then `a` → Go to Achievements
   - Press `g` then `c` → Go to Community
   - Press `g` then `s` → Go to Settings
   - Press `g` then `h` → Go to Help
   - Press `g` then `p` → Go to Profile
5. **Test action shortcuts**:
   - Press `n` → Go to Vision Tests (new test)

### Test Input Field Behavior:
1. Click in any text input or textarea
2. Type `g` and `d`
3. **Expected**: Nothing happens (shortcuts disabled in inputs)
4. Click outside input
5. Press `g` then `d`
6. **Expected**: Navigate to dashboard

### Troubleshooting:
- Check browser console for errors
- Make sure you're logged in (shortcuts only work in protected routes)
- Verify you're not typing in an input field
- Try clicking on empty area first to ensure no input is focused

---

## Testing Error Boundary

### Manual Test Steps:
1. **Simulate an error**:
   - Temporarily break a component (e.g., call undefined function)
   - Or use React DevTools to throw an error
2. **Expected behavior**:
   - App doesn't completely crash
   - Shows friendly error page with teal/olive design
   - Has "Try Again" and "Go to Dashboard" buttons
3. **Development mode**:
   - Should show error details and stack trace
4. **Production mode**:
   - Should hide technical details

---

## Testing Loading Skeletons

### Usage Example:
```jsx
import { SkeletonCard, SkeletonTable } from '../components/Skeleton'

function MyComponent() {
  const [loading, setLoading] = useState(true)
  
  if (loading) {
    return <SkeletonCard />
  }
  
  return <ActualCard data={data} />
}
```

---

## Common Issues & Fixes

### Issue: Dark mode not working
**Fix**: 
- Check if ThemeProvider wraps the app in App.jsx
- Verify tailwind.config.js has `darkMode: 'class'`
- Clear localStorage and try again

### Issue: Keyboard shortcuts not responding
**Fix**:
- Check if KeyboardShortcutsProvider wraps Router in App.jsx
- Make sure you're on a protected route (logged in)
- Click on page background to unfocus any inputs
- Check console for errors

### Issue: Theme doesn't persist
**Fix**:
- Check localStorage: `localStorage.getItem('eyevio-theme')`
- Should return 'light' or 'dark'
- If null, theme isn't saving

### Issue: Shortcuts work but navigation doesn't
**Fix**:
- Make sure you're logged in
- Routes might need authentication
- Check if routes exist in App.jsx

---

## Browser DevTools Commands

### Check current theme:
```js
localStorage.getItem('eyevio-theme')
```

### Manually set theme:
```js
localStorage.setItem('eyevio-theme', 'dark')
location.reload()
```

### Check if dark mode class is applied:
```js
document.documentElement.classList.contains('dark')
```

### Clear all settings:
```js
localStorage.clear()
location.reload()
```

---

## Expected Console Output

### On page load:
- No errors
- Service worker registration message (if PWA enabled)

### When toggling theme:
- Theme updates in localStorage
- Dark class added/removed from document

### When using keyboard shortcuts:
- Navigation occurs smoothly
- No console errors
- Toast notification for help modal

---

## Performance Checks

### Dark Mode:
- Toggle should be instant (no lag)
- No flash of wrong theme on page load

### Keyboard Shortcuts:
- Response time < 100ms
- No memory leaks (check DevTools Memory tab)

### Skeletons:
- Should appear immediately
- Smooth pulse animation
- No layout shift when real content loads
