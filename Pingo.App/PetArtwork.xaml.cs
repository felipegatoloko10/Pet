using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Animation;

namespace Pingo.Desktop;
public partial class PetArtwork : UserControl
{
    public PetArtwork()
    {
        InitializeComponent();
        if (SystemParameters.ClientAreaAnimation)
            Float.BeginAnimation(System.Windows.Media.TranslateTransform.YProperty, new DoubleAnimation(0, -5, TimeSpan.FromSeconds(1.8)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever });
    }
}
