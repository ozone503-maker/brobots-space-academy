from playwright.sync_api import sync_playwright
import os,math
os.makedirs('/tmp/th',exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True);pg=ctx.new_page()
    pg.goto('http://127.0.0.1:8798/idle.html#rec');pg.wait_for_function('window.ready')
    cdp=ctx.new_cdp_session(pg)
    def touch(typ,pts):cdp.send('Input.dispatchTouchEvent',{'type':typ,'touchPoints':[{'x':x,'y':y,'id':i} for i,(x,y) in pts]})
    down=False
    for i in range(100):
        t=i*0.04
        if t<2.6:
            u=t/2.6
            L=(60+80*math.sin(u*6.28),620-260*u+40*math.sin(u*12)); R=(330-80*math.sin(u*6.28+1),640-240*u)
            if 0.2<t: 
                touch('touchMove' if down else 'touchStart',[(0,L),(1,R)]);down=True
        elif down: touch('touchEnd',[]);down=False
        pg.evaluate(f'draw({t})');pg.locator('canvas').screenshot(path=f'/tmp/th/{i:03d}.png')
    print(pg.evaluate('JSON.stringify(FP)'));b.close()
