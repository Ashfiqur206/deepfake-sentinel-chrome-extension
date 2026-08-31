

import os
from PIL import Image, ImageDraw


def create_icon(size, output_path):


    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Colors
    primary_color = (102, 126, 234, 255)  # #667eea
    white = (255, 255, 255, 255)

    # Calculate proportions based on size
    margin = size // 8
    shield_width = size - (margin * 2)
    shield_height = size - margin

    # Draw shield shape
    points = [
        (size // 2, margin),
        (size - margin, margin + shield_height // 4),
        (size - margin, margin + shield_height // 2),
        (size // 2, size - margin // 2),
        (margin, margin + shield_height // 2),
        (margin, margin + shield_height // 4),
    ]

    draw.polygon(points, fill=primary_color, outline=white, width=max(1, size // 30))

    # Draw checkmark for larger icons
    if size >= 48:
        check_size = size // 3
        check_x = size // 2 - check_size // 3
        check_y = size // 2 - check_size // 4

        check_points = [
            (check_x, check_y + check_size // 2),
            (check_x + check_size // 3, check_y + check_size),
            (check_x + check_size, check_y - check_size // 4)
        ]

        line_width = max(3, size // 20)
        draw.line(check_points, fill=white, width=line_width, joint='curve')

    # For small icons, draw a simple dot
    if size == 16:
        center = size // 2
        draw.ellipse([(center - 4, center - 4), (center + 4, center + 4)], fill=white)

    # Save the icon
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    print(f"✅ Created: {output_path} ({size}x{size})")


def create_all_icons():
    """Generate all icon sizes for the extension."""

    icon_sizes = [
        (16, 'icons/icon16.png'),
        (48, 'icons/icon48.png'),
        (128, 'icons/icon128.png'),
    ]

    print("🎨 Generating icons for DeepFake Sentinel extension...")
    print("-" * 40)

    for size, path in icon_sizes:
        create_icon(size, path)

    print("-" * 40)
    print("✨ All icons generated successfully!")
    print("\n📁 Icons created:")
    for size, path in icon_sizes:
        print(f"   - {path} ({size}x{size})")


if __name__ == "__main__":
    create_all_icons()