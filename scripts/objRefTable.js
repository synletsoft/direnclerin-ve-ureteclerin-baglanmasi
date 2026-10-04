const C3 = self.C3;
self.C3_GetObjectRefTable = function () {
	return [
		C3.Plugins.Touch,
		C3.Plugins.Sprite,
		C3.Plugins.Browser,
		C3.Behaviors.Tween,
		C3.Plugins.Text,
		C3.Plugins.System.Cnds.OnLayoutStart,
		C3.Behaviors.Tween.Acts.TweenOneProperty,
		C3.Plugins.System.Acts.Wait,
		C3.Plugins.System.Acts.SetBoolVar,
		C3.Plugins.System.Cnds.EveryTick,
		C3.Plugins.System.Cnds.CompareBoolVar,
		C3.Plugins.Sprite.Acts.SetWidth,
		C3.Plugins.System.Exps.loadingprogress,
		C3.Plugins.System.Cnds.Compare,
		C3.Plugins.System.Acts.GoToLayout
	];
};
self.C3_JsPropNameTable = [
	{Touch: 0},
	{refreshBtn: 0},
	{audioBtn: 0},
	{shareBtn: 0},
	{fullScreenBtn: 0},
	{Browser: 0},
	{loaderEmpty: 0},
	{Tween: 0},
	{loaderFill: 0},
	{loaderLogo: 0},
	{arkaplan: 0},
	{circuitArt: 0},
	{bulbGlow: 0},
	{circuitText: 0},
	{isLoader: 0}
];

self.InstanceType = {
	Touch: class extends self.IInstance {},
	refreshBtn: class extends self.ISpriteInstance {},
	audioBtn: class extends self.ISpriteInstance {},
	shareBtn: class extends self.ISpriteInstance {},
	fullScreenBtn: class extends self.ISpriteInstance {},
	Browser: class extends self.IInstance {},
	loaderEmpty: class extends self.ISpriteInstance {},
	loaderFill: class extends self.ISpriteInstance {},
	loaderLogo: class extends self.ISpriteInstance {},
	arkaplan: class extends self.ISpriteInstance {},
	circuitArt: class extends self.ISpriteInstance {},
	bulbGlow: class extends self.ISpriteInstance {},
	circuitText: class extends self.ITextInstance {}
}