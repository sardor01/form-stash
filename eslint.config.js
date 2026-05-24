import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  react: true,
}).append({
  rules: {
    'no-alert': 'off',
  },
})
