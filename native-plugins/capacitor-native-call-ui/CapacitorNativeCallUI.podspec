require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorNativeCallUI'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://vixo.click'
  s.author = package['author']
  s.source = { :git => 'https://github.com/vex/capacitor-native-call-ui.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation'
  s.swift_version = '5.1'
end
