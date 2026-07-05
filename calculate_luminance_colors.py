#!/usr/bin/env python3
"""
Calculate Perfect Luminance-Matched Colors for Ishihara Plates
Uses WCAG relative luminance formula to ensure Y ≈ 0.30 (±0.02)
"""

import math

def srgb_to_linear(component):
    """Convert sRGB component to linear RGB (gamma correction)"""
    if component <= 0.03928:
        return component / 12.92
    else:
        return ((component + 0.055) / 1.055) ** 2.4

def get_luminance(hex_color):
    """Calculate WCAG relative luminance (Y) from hex color"""
    # Remove '#' if present
    hex_color = hex_color.lstrip('#')
    
    # Convert to RGB (0-1 range)
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0
    
    # Apply gamma correction
    r_linear = srgb_to_linear(r)
    g_linear = srgb_to_linear(g)
    b_linear = srgb_to_linear(b)
    
    # Calculate relative luminance
    Y = 0.2126 * r_linear + 0.7152 * g_linear + 0.0722 * b_linear
    
    return Y

def hsl_to_rgb(h, s, l):
    """Convert HSL to RGB"""
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    
    if 0 <= h < 60:
        r, g, b = c, x, 0
    elif 60 <= h < 120:
        r, g, b = x, c, 0
    elif 120 <= h < 180:
        r, g, b = 0, c, x
    elif 180 <= h < 240:
        r, g, b = 0, x, c
    elif 240 <= h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    
    r = int((r + m) * 255)
    g = int((g + m) * 255)
    b = int((b + m) * 255)
    
    return f'#{r:02X}{g:02X}{b:02X}'

def generate_luminance_matched_palette(base_hue, target_Y=0.30, tolerance=0.02, num_shades=12):
    """
    Generate palette of colors with identical luminance (Y)
    base_hue: 0-360 (e.g., 30 for orange, 100 for green)
    target_Y: Target luminance (0.28-0.32 for clinical grade)
    """
    colors = []
    
    # Try different saturation and lightness combinations
    for s in [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]:
        for l in [0.40, 0.42, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60]:
            # Generate color
            color = hsl_to_rgb(base_hue, s, l)
            Y = get_luminance(color)
            
            # Check if within tolerance
            if abs(Y - target_Y) <= tolerance:
                colors.append({
                    'hex': color,
                    'Y': Y,
                    'h': base_hue,
                    's': s,
                    'l': l
                })
    
    # Sort by luminance and return evenly spaced
    colors.sort(key=lambda x: x['Y'])
    
    # Select evenly spaced colors
    if len(colors) > num_shades:
        step = len(colors) / num_shades
        selected = [colors[int(i * step)] for i in range(num_shades)]
        return selected
    
    return colors

def main():
    print("=" * 80)
    print("CLINICAL-GRADE ISHIHARA COLOR PALETTE GENERATOR")
    print("=" * 80)
    print()
    
    # Target luminance
    target_Y = 0.30
    tolerance = 0.02  # ±0.02 gives Y = 0.28-0.32
    
    print(f"Target Luminance (Y): {target_Y:.2f} ± {tolerance:.2f}")
    print(f"Valid Range: Y = {target_Y - tolerance:.2f} to {target_Y + tolerance:.2f}")
    print()
    
    # Generate orange palette (number)
    print("🟠 ORANGE PALETTE (Number):")
    print("-" * 80)
    orange_colors = generate_luminance_matched_palette(30, target_Y, tolerance, 12)
    
    orange_hex = []
    for color in orange_colors:
        print(f"  '{color['hex']}'  (Y={color['Y']:.4f}, H={color['h']:.0f}°, S={color['s']:.2f}, L={color['l']:.2f})")
        orange_hex.append(color['hex'])
    
    print()
    print("JavaScript Array:")
    print("number: [")
    print("  " + ", ".join([f"'{h}'" for h in orange_hex[:4]]) + ",")
    print("  " + ", ".join([f"'{h}'" for h in orange_hex[4:8]]) + ",")
    print("  " + ", ".join([f"'{h}'" for h in orange_hex[8:]]))
    print("],")
    print()
    
    # Generate green palette (background)
    print("🟢 GREEN PALETTE (Background):")
    print("-" * 80)
    green_colors = generate_luminance_matched_palette(100, target_Y, tolerance, 12)
    
    green_hex = []
    for color in green_colors:
        print(f"  '{color['hex']}'  (Y={color['Y']:.4f}, H={color['h']:.0f}°, S={color['s']:.2f}, L={color['l']:.2f})")
        green_hex.append(color['hex'])
    
    print()
    print("JavaScript Array:")
    print("background: [")
    print("  " + ", ".join([f"'{h}'" for h in green_hex[:4]]) + ",")
    print("  " + ", ".join([f"'{h}'" for h in green_hex[4:8]]) + ",")
    print("  " + ", ".join([f"'{h}'" for h in green_hex[8:]]))
    print("],")
    print()
    
    # Validation
    print("=" * 80)
    print("VALIDATION:")
    print("=" * 80)
    orange_Y_values = [c['Y'] for c in orange_colors]
    green_Y_values = [c['Y'] for c in green_colors]
    
    print(f"Orange Y range: {min(orange_Y_values):.4f} - {max(orange_Y_values):.4f}")
    print(f"Orange Y average: {sum(orange_Y_values)/len(orange_Y_values):.4f}")
    print(f"Green Y range: {min(green_Y_values):.4f} - {max(green_Y_values):.4f}")
    print(f"Green Y average: {sum(green_Y_values)/len(green_Y_values):.4f}")
    print()
    
    all_Y = orange_Y_values + green_Y_values
    print(f"Combined Y range: {min(all_Y):.4f} - {max(all_Y):.4f}")
    print(f"Combined Y average: {sum(all_Y)/len(all_Y):.4f}")
    print()
    
    in_range = all([target_Y - tolerance <= y <= target_Y + tolerance for y in all_Y])
    print(f"✅ All colors within Y={target_Y - tolerance:.2f} to {target_Y + tolerance:.2f}: {in_range}")
    print()
    
    print("=" * 80)
    print("GRAYSCALE TEST:")
    print("=" * 80)
    print("To validate: Convert image to grayscale")
    print("Expected: Number should be INVISIBLE (no shadow)")
    print("If number is visible: Luminance mismatch detected!")
    print("=" * 80)

if __name__ == "__main__":
    main()
