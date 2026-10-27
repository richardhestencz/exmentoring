# mosómedve újraépítése: hegesztés (zárt háló), decimálás, csontváz, súlyok zárt voxel-proxyról
import bpy,bmesh,sys
args=sys.argv[sys.argv.index('--')+1:]; src,dst,target=args[0],args[1],int(args[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in [o for o in bpy.data.objects if o.type=='MESH' and len(o.data.polygons)<1000]: bpy.data.objects.remove(o)
o=[o for o in bpy.data.objects if o.type=='MESH'][0]
bpy.context.view_layer.objects.active=o; o.select_set(True)
o.parent=None; bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=0.001)
bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(o.data); bm.free()
m=o.modifiers.new('dec','DECIMATE'); m.ratio=target/len(o.data.polygons); m.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier='dec')
for mat in o.data.materials:
    nt=mat.node_tree; bsdf=next(x for x in nt.nodes if x.type=='BSDF_PRINCIPLED')
    for inp in ('Metallic','Roughness','Normal'):
        for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
for p in o.data.polygons: p.use_smooth=True
for img in bpy.data.images:
    if img.size[0]>1024: img.scale(1024,int(1024*img.size[1]/img.size[0]))
bm=bmesh.new(); bm.from_mesh(o.data); print('MESH',len(o.data.polygons),'boundary',sum(1 for e in bm.edges if e.is_boundary)); bm.free()
# csontváz (ugyanaz, mint rig.py)
Y=-0.17
Bn={'hips':((0,Y,0.21),(0,Y,0.30),None),'spine':((0,Y,0.30),(0,Y,0.42),'hips'),'chest':((0,Y,0.42),(0,Y,0.55),'spine'),
 'neck':((0,Y,0.55),(0,Y,0.62),'chest'),'head':((0,Y,0.62),(0,Y,1.0),'neck'),
 'tail1':((0,-0.08,0.2),(0,0.18,0.12),'hips'),'tail2':((0,0.18,0.12),(0,0.41,0.09),'tail1')}
for s,sx in (('L',1),('R',-1)):
    Bn['thigh.'+s]=((sx*0.09,Y,0.21),(sx*0.1,Y-0.01,0.11),'hips'); Bn['shin.'+s]=((sx*0.1,Y-0.01,0.11),(sx*0.1,-0.2,0.02),'thigh.'+s)
    Bn['upperarm.'+s]=((sx*0.17,Y,0.52),(sx*0.28,Y,0.41),'chest'); Bn['forearm.'+s]=((sx*0.28,Y,0.41),(sx*0.37,Y,0.31),'upperarm.'+s)
arm=bpy.data.armatures.new('rig'); ao=bpy.data.objects.new('rig',arm); bpy.context.scene.collection.objects.link(ao)
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode='EDIT')
eb={}
for n,(h,t,p) in Bn.items(): b=arm.edit_bones.new(n); b.head=h; b.tail=t; eb[n]=b
for n,(h,t,p) in Bn.items():
    if p: eb[n].parent=eb[p]
bpy.ops.object.mode_set(mode='OBJECT')
# zárt proxy: voxel remesh, rajta automatikus súlyok
px=o.copy(); px.data=o.data.copy(); px.name='proxy'; bpy.context.scene.collection.objects.link(px)
r=px.modifiers.new('rm','REMESH'); r.mode='VOXEL'; r.voxel_size=0.008
bpy.context.view_layer.objects.active=px; px.select_set(True); bpy.ops.object.modifier_apply(modifier='rm')
bpy.ops.object.select_all(action='DESELECT'); px.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active=ao
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('proxy groups',len(px.vertex_groups),'verts',len(px.data.vertices))
# súlyok átvitele a valódi hálóra (egybeeső pontok azonos súlyt kapnak)
for n in Bn: o.vertex_groups.new(name=n)
dt=o.modifiers.new('dt','DATA_TRANSFER'); dt.object=px; dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}
dt.vert_mapping='POLYINTERP_NEAREST'; dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=o; o.select_set(True)
bpy.ops.object.modifier_apply(modifier='dt')
bpy.data.objects.remove(px)
o.parent=ao; am=o.modifiers.new('Armature','ARMATURE'); am.object=ao
cnt={g.name:0 for g in o.vertex_groups}
for v in o.data.vertices:
    for g in v.groups:
        if g.weight>0.2: cnt[o.vertex_groups[g.group].name]+=1
print('weights',cnt)
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_skins=True,export_image_format='JPEG',export_jpeg_quality=85)
