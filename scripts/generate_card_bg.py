import random

def generate_circuit_svg():
    width = 800
    height = 500
    random.seed(42)  # For reproducible crisp layout

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%">')
    svg.append('<defs>')
    
    # Gradients
    svg.append('''
      <radialGradient id="spaceGrad" cx="50%" cy="50%" r="75%">
        <stop offset="0%" stop-color="#08142C"/>
        <stop offset="60%" stop-color="#040A18"/>
        <stop offset="100%" stop-color="#02050D"/>
      </radialGradient>
      <radialGradient id="glowCyanLeft" cx="15%" cy="75%" r="45%">
        <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowBlueRight" cx="80%" cy="30%" r="45%">
        <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#0284C7" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="gleamDiag" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="25%" stop-color="transparent"/>
        <stop offset="50%" stop-color="#38BDF8" stop-opacity="0.12"/>
        <stop offset="75%" stop-color="transparent"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    ''')
    svg.append('</defs>')

    # Background rects
    svg.append(f'<rect width="{width}" height="{height}" fill="url(#spaceGrad)"/>')
    svg.append(f'<rect width="{width}" height="{height}" fill="url(#glowCyanLeft)"/>')
    svg.append(f'<rect width="{width}" height="{height}" fill="url(#glowBlueRight)"/>')

    # Circuit board tracks generator
    # Grid of lines with 90 and 45 degree bends and terminal circular pads
    colors = ['#38BDF8', '#0284C7', '#0EA5E9', '#06B6D4', '#2563EB', '#1D4ED8']
    opacities = [0.85, 0.7, 0.9, 0.6, 0.5]
    
    paths = []
    nodes = []

    # Horizontal & stepped tracks
    track_y_coords = [35, 60, 85, 115, 145, 180, 210, 240, 275, 305, 335, 365, 395, 425, 455, 475]
    
    for y in track_y_coords:
        # Left segment
        c = random.choice(colors)
        op = random.choice(opacities)
        sw = random.choice([2.0, 2.5, 3.0])
        
        x_start = random.randint(0, 40)
        seg1_len = random.randint(80, 220)
        bend_dir = random.choice([-1, 1])
        bend_len = random.randint(20, 45)
        seg2_len = random.randint(60, 200)
        
        x1 = x_start + seg1_len
        y1 = y
        x2 = x1 + bend_len
        y2 = y1 + (bend_dir * bend_len)
        x3 = x2 + seg2_len
        y3 = y2
        
        p = f'M {x_start} {y1} L {x1} {y1} L {x2} {y2} L {x3} {y3}'
        paths.append(f'<path d="{p}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-opacity="{op}" stroke-linecap="round" stroke-linejoin="round"/>')
        nodes.append((x3, y3, c, sw + 2.5))
        if random.random() > 0.4:
            nodes.append((x_start, y1, c, sw + 1.8))

        # Right segment
        c2 = random.choice(colors)
        op2 = random.choice(opacities)
        sw2 = random.choice([2.0, 2.5, 3.0])
        
        rx_start = width - random.randint(0, 50)
        rseg1_len = random.randint(80, 200)
        rbend_dir = random.choice([-1, 1])
        rbend_len = random.randint(20, 45)
        rseg2_len = random.randint(60, 180)
        
        rx1 = rx_start - rseg1_len
        ry1 = y + random.randint(-10, 10)
        rx2 = rx1 - rbend_len
        ry2 = ry1 + (rbend_dir * rbend_len)
        rx3 = rx2 - rseg2_len
        ry3 = ry2
        
        p2 = f'M {rx_start} {ry1} L {rx1} {ry1} L {rx2} {ry2} L {rx3} {ry3}'
        paths.append(f'<path d="{p2}" fill="none" stroke="{c2}" stroke-width="{sw2}" stroke-opacity="{op2}" stroke-linecap="round" stroke-linejoin="round"/>')
        nodes.append((rx3, ry3, c2, sw2 + 2.5))

    # Vertical interconnecting tracks
    track_x_coords = [90, 150, 220, 280, 360, 440, 520, 600, 680, 740]
    for x in track_x_coords:
        c = random.choice(colors)
        op = random.choice([0.65, 0.8, 0.9])
        sw = random.choice([2.0, 2.5])
        
        y_start = random.randint(10, 60) if random.random() > 0.5 else random.randint(280, 400)
        v_len = random.randint(70, 160)
        bend_dir = random.choice([-1, 1])
        bend_len = random.randint(20, 35)
        v_len2 = random.randint(40, 110)
        
        y1 = y_start + v_len
        x1 = x
        x2 = x1 + (bend_dir * bend_len)
        y2 = y1 + bend_len
        y3 = y2 + v_len2
        x3 = x2
        
        p = f'M {x} {y_start} L {x1} {y1} L {x2} {y2} L {x3} {y3}'
        paths.append(f'<path d="{p}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-opacity="{op}" stroke-linecap="round" stroke-linejoin="round"/>')
        nodes.append((x3, y3, c, sw + 2.5))
        nodes.append((x, y_start, c, sw + 2.0))

    # Dense bus groups (parallel tracks like RAM / PCIe bus in the template)
    # Bottom dense bus
    for i in range(12):
        bx = 470 + i * 16
        c = '#38BDF8' if i % 2 == 0 else '#0EA5E9'
        op = 0.85
        paths.append(f'<path d="M {bx} 500 L {bx} 390 L {bx + 30} 360 L {bx + 80} 360" fill="none" stroke="{c}" stroke-width="2.2" stroke-opacity="{op}" stroke-linecap="round"/>')
        nodes.append((bx + 80, 360, c, 3.8))

    # Top dense bus
    for i in range(10):
        bx = 180 + i * 18
        c = '#22D3EE' if i % 2 == 0 else '#38BDF8'
        op = 0.8
        paths.append(f'<path d="M {bx} 0 L {bx} 110 L {bx + 25} 135 L {bx + 70} 135" fill="none" stroke="{c}" stroke-width="2.2" stroke-opacity="{op}" stroke-linecap="round"/>')
        nodes.append((bx + 70, 135, c, 3.8))

    # Middle IC fanout lines
    for i in range(8):
        by = 180 + i * 14
        c = '#38BDF8'
        paths.append(f'<path d="M 320 {by} L 370 {by} L 400 {by + 30} L 450 {by + 30}" fill="none" stroke="{c}" stroke-width="2" stroke-opacity="0.85" stroke-linecap="round"/>')
        nodes.append((450, by + 30, c, 3.5))
        nodes.append((320, by, c, 3.0))

    # Append paths
    svg.append('\n'.join(paths))

    # Append terminal nodes (circular solder pads)
    for nx, ny, nc, nr in nodes:
        # Don't draw outside bounds
        if 5 <= nx <= width - 5 and 5 <= ny <= height - 5:
            svg.append(f'<circle cx="{nx}" cy="{ny}" r="{nr}" fill="{nc}" fill-opacity="0.95" />')
            svg.append(f'<circle cx="{nx}" cy="{ny}" r="{max(1.0, nr - 1.6)}" fill="#020817" />')

    # Digital particles / stars
    for _ in range(80):
        px = random.randint(10, width - 10)
        py = random.randint(10, height - 10)
        pr = random.uniform(0.6, 1.8)
        po = random.uniform(0.3, 0.85)
        pcol = random.choice(['#E0F2FE', '#BAE6FD', '#7DD3FC', '#38BDF8', '#FFFFFF'])
        svg.append(f'<circle cx="{px}" cy="{py}" r="{pr}" fill="{pcol}" fill-opacity="{po}" />')

    # Overlay diagonal gleam
    svg.append(f'<rect width="{width}" height="{height}" fill="url(#gleamDiag)" pointer-events="none"/>')

    svg.append('</svg>')
    return '\n'.join(svg)

svg_content = generate_circuit_svg()
with open('static/img/card-circuit-bg.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)
print("Generated static/img/card-circuit-bg.svg successfully! Size:", len(svg_content))
