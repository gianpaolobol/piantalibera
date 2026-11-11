Pod::Spec.new do |s|
  s.name = 'PiantaAr'
  s.version = '1.0.0'
  s.summary = 'Scansione AR di una stanza con ARKit per Pianta Libera'
  s.description = 'Modulo Expo locale: fotogrammi chiave con posizione e intrinseci, piani classificati, profondità LiDAR se presente; esporta un file zip.'
  s.author = 'Pianta Libera'
  s.homepage = 'https://github.com/gianpaolobol/piantalibera'
  s.license = { :type => 'AGPL-3.0-only' }
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://github.com/gianpaolobol/piantalibera.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ARKit', 'SceneKit', 'CoreImage'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
