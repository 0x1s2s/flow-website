import urllib.request
import json
import urllib.parse
import os

games = {
    'Flickshot': 16738734208,
    'Blade Ball': 13772394625,
    'Blox Fruits': 2753915549,
    'Brookhaven': 4924922222,
    'Jujutsu Shenanigans': 10449761463,
    'RIVALS': 17625359962,
    'Escape Tsunami for Lucky Blocks': 16550066266,
    'Escape Tsunami for Brainrots': 16982956276,
    'SCP: RetroBreach': 18037307615,
    '99 Nights In The Forest': 17540203009,
    'Scary Shawarma Kiosk': 17565369689,
    'Murder Mystery 2': 142823291,
    'Zo Samurai': 5080064506
}

for name, place_id in games.items():
    try:
        url = f'https://thumbnails.roproxy.com/v1/places/gameicons?placeIds={place_id}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req)
        data = json.loads(res.read())
        if data.get('data') and len(data['data']) > 0:
            image_url = data['data'][0]['imageUrl']
            # download image
            filename = f"icons/{name.replace(':', '').replace(' ', '_').lower()}.png"
            urllib.request.urlretrieve(image_url, filename)
            print(f"Downloaded {name}")
    except Exception as e:
        print(f"Failed {name}: {e}")

print("Done")
