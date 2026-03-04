import xml.etree.ElementTree as ET

def is_dark(hex_str):
    if not hex_str or hex_str.lower() == 'none': return False
    hex_str = hex_str.lstrip('#')
    try:
        r = int(hex_str[0:2], 16)
        g = int(hex_str[2:4], 16)
        b = int(hex_str[4:6], 16)
        yiq = ((r*299) + (g*587) + (b*114)) / 1000
        return yiq < 128
    except:
        return False

def process(input_f, output_f, target_color):
    try:
        ET.register_namespace('', "http://www.w3.org/2000/svg")
        tree = ET.parse(input_f)
        root = tree.getroot()
        for elem in root.iter():
            fill = elem.get('fill')
            if fill:
                if is_dark(fill):
                    elem.set('fill', target_color)
                else:
                    elem.set('fill', 'none')
        tree.write(output_f)
        print(f"Generated {output_f}")
    except Exception as e:
        print(f"Error: {e}")

process("public/logo.svg", "public/logo-white.svg", "#ffffff")
process("public/logo.svg", "public/logo-black.svg", "#000000")
