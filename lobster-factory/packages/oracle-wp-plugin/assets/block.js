/**
 * Editor UI for the "aware-wave/oracle" block: one visible button per engine tool (no dropdown);
 * the front end is rendered by PHP (Renderer). Labels and the tool list come from window.AWORACLE_BLOCK.
 */
(function (wp) {
  'use strict';
  var el = wp.element.createElement;
  var Button = wp.components.Button;
  var useBlockProps = wp.blockEditor.useBlockProps;
  var data = window.AWORACLE_BLOCK || { tools: [], labels: {} };
  var L = data.labels || {};

  wp.blocks.registerBlockType('aware-wave/oracle', {
    edit: function (props) {
      var tool = props.attributes.tool;
      var tools = data.tools || [];
      var buttons = tools.map(function (t) {
        return el(
          Button,
          {
            key: t,
            variant: t === tool ? 'primary' : 'secondary',
            isPressed: t === tool,
            onClick: function () { props.setAttributes({ tool: t }); },
            style: { marginRight: '6px', marginBottom: '6px' }
          },
          t
        );
      });
      return el(
        'div',
        useBlockProps({ style: { border: '1px dashed currentColor', padding: '12px' } }),
        el('strong', null, L.title || 'AwareWave Oracle'),
        el('p', null, tool ? (L.chosen || '') + ' ' + tool : (L.pick || '')),
        tools.length ? el('div', null, buttons) : el('p', null, L.none || ''),
        tool ? el('p', { style: { opacity: 0.7 } }, L.preview || '') : null
      );
    },
    save: function () {
      return null; // server-rendered
    }
  });

  // Daily-letter signup (Daily\Signup): no settings; the form appears on the published page.
  wp.blocks.registerBlockType('aware-wave/oracle-daily', {
    edit: function () {
      return el(
        'div',
        useBlockProps({ style: { border: '1px dashed currentColor', padding: '12px' } }),
        el('strong', null, L.dailyTitle || 'Daily fortune signup'),
        el('p', { style: { opacity: 0.7 } }, L.dailyPreview || '')
      );
    },
    save: function () {
      return null; // server-rendered
    }
  });
})(window.wp);
