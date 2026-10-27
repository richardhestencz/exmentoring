# pózok a mosómedvére (Blender-akciók), előnézet szemből és oldalról
import bpy,sys,math
args=sys.argv[sys.argv.index('--')+1:]
src,out_glb,prev=args[0],args[1],args[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'][0]
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
D=math.radians
# póz: csont -> (x, y, z) fok, a csont saját tengelyei körül
POSES={
 'stand':{'upperarm.L':(0,0,0),'upperarm.R':(0,0,0)},
 'sit':{'thigh.L':(-88,0,-6),'thigh.R':(-88,0,6),'shin.L':(92,0,0),'shin.R':(92,0,0),
        'upperarm.L':(-35,0,-20),'upperarm.R':(-35,0,20),'forearm.L':(-45,0,0),'forearm.R':(-45,0,0),'spine':(6,0,0),'head':(-6,0,0),'tail1':(30,0,0)},
 'sit_ground':{'thigh.L':(-85,0,-8),'thigh.R':(-85,0,8),'shin.L':(10,0,0),'shin.R':(10,0,0),
        'upperarm.L':(-55,0,-15),'upperarm.R':(-55,0,15),'forearm.L':(-30,0,0),'forearm.R':(-30,0,0),'spine':(4,0,0),'tail1':(35,0,0)},
 'lie':{'thigh.L':(-30,0,-6),'thigh.R':(-30,0,6),'shin.L':(20,0,0),'shin.R':(20,0,0),
        'upperarm.L':(-25,0,-10),'upperarm.R':(-25,0,10),'forearm.L':(-50,0,0),'forearm.R':(-50,0,0),'head':(-15,0,0)},
 'paddle':{'thigh.L':(-80,0,-10),'thigh.R':(-80,0,10),'shin.L':(60,0,0),'shin.R':(60,0,0),
        'upperarm.L':(-70,0,-10),'upperarm.R':(-70,0,10),'forearm.L':(-40,0,0),'forearm.R':(-40,0,0),'spine':(10,0,0)},
 'fish':{'thigh.L':(-85,0,-8),'thigh.R':(-85,0,8),'shin.L':(10,0,0),'shin.R':(10,0,0),
        'upperarm.L':(-65,0,10),'upperarm.R':(-65,0,-10),'forearm.L':(-35,0,0),'forearm.R':(-35,0,0),'spine':(4,0,0),'tail1':(35,0,0)},
}
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones: pb.rotation_mode='XYZ'
arm.animation_data_create()
for name,pose in POSES.items():
    act=bpy.data.actions.new(name); act.use_fake_user=True; arm.animation_data.action=act
    for pb in arm.pose.bones:
        r=pose.get(pb.name,(0,0,0)); pb.rotation_euler=(D(r[0]),D(r[1]),D(r[2]))
        pb.keyframe_insert('rotation_euler',frame=1)
    tr=arm.animation_data.nla_tracks.new(); tr.name=name; tr.strips.new(name,1,act); arm.animation_data.action=None
# mozgásciklusok: csont -> fok a ciklus fázisának (0..1) függvényében; az első és utolsó kocka azonos, így hézag nélkül ismétlődik
S=lambda ph,k=0: math.sin(2*math.pi*(ph+k))
def walk(A,K,arms,lean):
    return lambda ph:{'thigh.L':(-A*S(ph),0,0),'thigh.R':(A*S(ph),0,0),
      'shin.L':(K*max(0,S(ph,0.25)),0,0),'shin.R':(K*max(0,S(ph,0.75)),0,0),
      'upperarm.L':(-55,0,arms*S(ph)),'upperarm.R':(-55,0,arms*S(ph)),'forearm.L':(-15-arms*0.3,0,0),'forearm.R':(-15-arms*0.3,0,0),
      'spine':(lean,0,3*S(ph)),'head':(-lean*0.6,0,-3*S(ph)),'tail1':(25,0,14*S(ph)),'tail2':(10,0,18*S(ph,0.15))}
CYCLES={'walk':(24,walk(34,50,24,4)),'run':(16,walk(48,85,45,14)),
 'idle':(48,lambda ph:{'spine':(2*S(ph),0,0),'head':(-1.5*S(ph,0.1),0,4*S(ph,0.3)),'upperarm.L':(-52+3*S(ph),0,0),'upperarm.R':(-52+3*S(ph),0,0),'forearm.L':(-12,0,0),'forearm.R':(-12,0,0),'tail1':(20,0,10*S(ph)),'tail2':(8,0,14*S(ph,0.2))})}
for name,(n,fn) in CYCLES.items():
    act=bpy.data.actions.new(name); act.use_fake_user=True; arm.animation_data.action=act
    for f in range(0,n+1,2):
        pose=fn(f/n)
        for pb in arm.pose.bones:
            r=pose.get(pb.name,(0,0,0)); pb.rotation_euler=(D(r[0]),D(r[1]),D(r[2])); pb.keyframe_insert('rotation_euler',frame=1+f)
    tr=arm.animation_data.nla_tracks.new(); tr.name=name; tr.strips.new(name,1,act); arm.animation_data.action=None
bpy.ops.object.mode_set(mode='OBJECT')
# előnézet: minden pózról szemből és oldalról
sc=bpy.context.scene; w=bpy.data.worlds.new('w'); sc.world=w; w.color=(0.85,0.85,0.85)
sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); sc.collection.objects.link(sun); sun.rotation_euler=(0.9,0.2,0.6); sun.data.energy=3
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=1.3
sc.render.resolution_x=sc.render.resolution_y=360
for name,fr in [(n,1) for n in POSES]+[(n,1+int(CYCLES[n][0]*q)) for n in CYCLES for q in (0,0.25,0.5)]:
    for tr in arm.animation_data.nla_tracks: tr.mute = tr.name!=name
    sc.frame_set(fr)
    for view,(loc,rot) in {'front':((0,-3,0.5),(D(90),0,0)),'side':((3,0,0.5),(D(90),0,D(90)))}.items():
        cam.location=loc; cam.rotation_euler=rot; sc.render.filepath=f'{prev}/{name}{fr if fr>1 else ""}_{view}.png'; bpy.ops.render.render(write_still=True)
for tr in arm.animation_data.nla_tracks: tr.mute=False
bpy.ops.export_scene.gltf(filepath=out_glb,export_format='GLB',export_skins=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_draco_mesh_compression_enable=True,export_image_format='JPEG',export_jpeg_quality=85)
print('done')
