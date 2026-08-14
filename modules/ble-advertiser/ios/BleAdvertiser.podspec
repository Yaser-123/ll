require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'BleAdvertiser'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.homepage       = 'https://github.com/lifeline-app/lifeline'
  s.platforms      = {
    ios: '14.0'
  }
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true

  # expo-modules-core provides the Module base class
  s.dependency 'ExpoModulesCore'

  # All Swift source files in this directory
  s.source_files = 'BleAdvertiserModule.swift'
end
