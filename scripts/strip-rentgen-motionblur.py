from pathlib import Path
import sys, hashlib
root=Path(sys.argv[1])
java=root/'src/main/java'
combat={p.relative_to(java):hashlib.sha256(p.read_bytes()).hexdigest() for p in java.glob('syrux/client/module/combat/*.java')}
for path in [
    'syrux/client/render/RentgenRenderer.java',
    'syrux/client/module/render/RentgenModule.java',
    'syrux/client/module/render/MotionBlurModule.java',
]:
    (java/path).unlink(missing_ok=True)
for file in ['motion_blur.vsh','motion_blur.fsh','rentgen_scan.vsh','rentgen_scan.fsh']:
    (root/'src/main/resources/assets/syrux/shaders/core'/file).unlink(missing_ok=True)
changes={
    'syrux/mixin/GameRendererMixin.java':[
        'import syrux.client.module.render.MotionBlurModule;',
        '''   @Inject(method = "renderWorld(Lnet/minecraft/client/render/RenderTickCounter;)V", at = @At("TAIL"))
   private void smearFrameAfterHand(RenderTickCounter renderTickCounter, CallbackInfo callbackInfo) {
      MotionBlurModule.method3838();
   }
'''],
    'syrux/client/render/PipelineWarmup.java':[
        'import syrux.client.module.render.MotionBlurModule;',
        'import syrux.client.module.render.RentgenModule;',
        '      MotionBlurModule.class,','      RentgenModule.class,'],
    'syrux/client/module/ModuleManager.java':[
        'import syrux.client.module.render.MotionBlurModule;',
        '         registerModule(MotionBlurModule.method3837());'],
    'syrux/client/module/render/TargetEspModule.java':[
        'import syrux.client.module.render.RentgenModule;',
        'import syrux.client.render.RentgenRenderer;']
}
for fname, subs in changes.items():
    p=java/fname
    s=p.read_text('utf-8')
    for item in subs:s=s.replace(item,'')
    if fname.endswith('TargetEspModule.java'):
        token='                  if (this.field06278.isSelected("Рентген")) {'
        if token in s:
            start=s.index(token)
            depth=0
            for i in range(s.index('{',start),len(s)):
                if s[i]=='{':depth+=1
                if s[i]=='}':
                    depth-=1
                    if depth==0:
                        s=s[:start]+s[i+1:]
                        break
        s=s.replace(', "Рентген")',')')
    p.write_text(s,'utf-8')
assert combat=={p.relative_to(java):hashlib.sha256(p.read_bytes()).hexdigest() for p in java.glob('syrux/client/module/combat/*.java')}
for p in java.rglob('*.java'):
    s=p.read_text('utf-8')
    for name in ('RentgenModule','RentgenRenderer','MotionBlurModule'):
        if name in s:raise RuntimeError(f'Leftover {name} in {p}')
print('Removed Rentgen and MotionBlur; protected',len(combat),'combat source files')
